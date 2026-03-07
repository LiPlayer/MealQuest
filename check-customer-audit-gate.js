#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname);
const customerDir = path.join(repoRoot, 'meal-quest-customer');
const ledgerPath = path.join(repoRoot, 'docs', 'security', 'customer-vulnerability-ledger.json');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmExecPath = process.env.npm_execpath;

function fail(message, details = []) {
  console.error(`[audit:customer:gate] FAILED: ${message}`);
  for (const detail of details) {
    console.error(`  - ${detail}`);
  }
  process.exit(1);
}

function runNpm(args) {
  const env = { ...process.env };
  env.npm_config_cache = path.join(repoRoot, '.npm-cache');
  const spawnOptions = {
    cwd: customerDir,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env,
  };
  const useNodeNpmCli = typeof npmExecPath === 'string' && npmExecPath.length > 0 && fs.existsSync(npmExecPath);
  const result = useNodeNpmCli
    ? spawnSync(process.execPath, [npmExecPath, ...args], spawnOptions)
    : spawnSync(npmBin, args, {
        ...spawnOptions,
        shell: process.platform === 'win32',
      });
  if (result.error) {
    fail(`spawn npm failed (${args.join(' ')})`, [result.error.message]);
  }
  return { status: result.status || 0, output: `${result.stdout || ''}${result.stderr || ''}` };
}

function findJsonStart(text) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '{') {
      return i;
    }
  }
  return -1;
}

function extractJsonObject(text) {
  const start = findJsonStart(text);
  if (start < 0) {
    throw new Error('no JSON object found in output');
  }

  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error('incomplete JSON object in output');
}

function parseMixedJson(text) {
  const payload = extractJsonObject(text);
  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new Error(`invalid JSON payload: ${error.message}`);
  }
}

function classifyFixability(vuln) {
  if (vuln.fixAvailable === false) {
    return 'no_fix';
  }
  if (vuln.fixAvailable === true) {
    return 'non_breaking_candidate';
  }
  if (vuln.fixAvailable && typeof vuln.fixAvailable === 'object') {
    if (vuln.fixAvailable.isSemVerMajor === true) {
      return 'requires_major';
    }
    return 'requires_upgrade';
  }
  return 'unknown';
}

function toVulnRows(auditVulnObj) {
  const rows = [];
  for (const vuln of Object.values(auditVulnObj || {})) {
    rows.push({
      name: String(vuln.name || ''),
      severity: String(vuln.severity || 'unknown'),
      fixability: classifyFixability(vuln),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

function readLedger() {
  if (!fs.existsSync(ledgerPath)) {
    fail('ledger file not found', [path.relative(repoRoot, ledgerPath)]);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    fail('ledger file is invalid JSON', [error.message]);
  }
  if (!Array.isArray(parsed.entries)) {
    fail('ledger file must contain entries[]');
  }
  const byName = new Map();
  for (const entry of parsed.entries) {
    const name = String(entry.name || '');
    if (!name) {
      fail('ledger entry missing name');
    }
    if (byName.has(name)) {
      fail('ledger entry duplicated', [name]);
    }
    byName.set(name, entry);
  }
  return { parsed, byName };
}

function printSummary(rows) {
  const bySeverity = { critical: 0, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 };
  const byFixability = {};
  for (const row of rows) {
    bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    byFixability[row.fixability] = (byFixability[row.fixability] || 0) + 1;
  }

  console.log(`[audit:customer:gate] vulnerabilities=${rows.length}`);
  console.log(`[audit:customer:gate] severity=${JSON.stringify(bySeverity)}`);
  console.log(`[audit:customer:gate] fixability=${JSON.stringify(byFixability)}`);
}

function printInstallSummary(report) {
  const install = report && typeof report.install === 'object' ? report.install : {};
  const added = Number(install.added || 0);
  const removed = Number(install.removed || 0);
  const changed = Number(install.changed || 0);
  console.log(`[audit:customer:gate] dryRunInstall=${JSON.stringify({ added, removed, changed })}`);
}

function validateNoPendingAutoFix(report) {
  const install = report && typeof report.install === 'object' ? report.install : {};
  const added = Number(install.added || 0);
  const removed = Number(install.removed || 0);
  const changed = Number(install.changed || 0);
  if (added > 0 || removed > 0 || changed > 0) {
    fail('pending non-force audit fixes detected', [
      `dry-run install delta: added=${added}, removed=${removed}, changed=${changed}`,
      'run npm audit fix in meal-quest-customer, then refresh ledger and re-run gate',
    ]);
  }
}

function validateLedgerAgainstAudit(rows, ledgerByName) {
  const rowNames = new Set(rows.map((row) => row.name));
  const ledgerNames = new Set(ledgerByName.keys());

  const missing = [...rowNames].filter((name) => !ledgerNames.has(name)).sort();
  const extra = [...ledgerNames].filter((name) => !rowNames.has(name)).sort();

  if (missing.length || extra.length) {
    const details = [];
    for (const item of missing) details.push(`missing ledger entry: ${item}`);
    for (const item of extra) details.push(`orphan ledger entry: ${item}`);
    fail('ledger coverage mismatch', details);
  }

  const allowedDecision = {
    non_breaking_candidate: ['blocked_by_upstream_lock', 'accept_with_control'],
    requires_major: ['defer_major_upgrade'],
    requires_upgrade: ['accept_with_control', 'defer_major_upgrade'],
    no_fix: ['accept_with_control'],
    unknown: ['accept_with_control'],
  };

  const details = [];
  for (const row of rows) {
    const entry = ledgerByName.get(row.name);
    if (entry.severity && String(entry.severity) !== row.severity) {
      details.push(`severity mismatch: ${row.name} audit=${row.severity} ledger=${entry.severity}`);
    }
    if (entry.fixability && String(entry.fixability) !== row.fixability) {
      details.push(`fixability mismatch: ${row.name} audit=${row.fixability} ledger=${entry.fixability}`);
    }

    const decision = String(entry.decision || '');
    if (!allowedDecision[row.fixability] || !allowedDecision[row.fixability].includes(decision)) {
      details.push(`decision invalid for ${row.name}: ${decision} (fixability=${row.fixability})`);
    }

    const reason = String(entry.reason || '').trim();
    const controls = Array.isArray(entry.compensatingControls) ? entry.compensatingControls : [];
    const exitCriteria = String(entry.exitCriteria || '').trim();
    const reviewDate = String(entry.reviewDate || '').trim();

    if (!reason) {
      details.push(`reason is required: ${row.name}`);
    }
    if (controls.length === 0) {
      details.push(`compensatingControls is required: ${row.name}`);
    }
    if (!exitCriteria) {
      details.push(`exitCriteria is required: ${row.name}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
      details.push(`reviewDate must be YYYY-MM-DD: ${row.name}`);
    }
  }

  if (details.length) {
    fail('ledger entries are not decision-complete', details);
  }
}

function main() {
  const mode = process.argv.includes('--gate') ? 'gate' : 'summary';

  const dryRun = runNpm(['audit', 'fix', '--dry-run', '--json', '--loglevel=error']);
  let report;
  try {
    report = parseMixedJson(dryRun.output);
  } catch (error) {
    fail('cannot parse npm audit dry-run JSON output', [error.message]);
  }

  const rows = toVulnRows(report.audit && report.audit.vulnerabilities ? report.audit.vulnerabilities : {});
  printSummary(rows);
  printInstallSummary(report);

  if (mode !== 'gate') {
    return;
  }

  validateNoPendingAutoFix(report);
  const { byName } = readLedger();
  validateLedgerAgainstAudit(rows, byName);
  console.log('[audit:customer:gate] OK (ledger fully matches current vulnerability set and controls).');
}

main();
