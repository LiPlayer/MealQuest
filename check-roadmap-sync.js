#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname);
const roadmapPath = path.join(repoRoot, 'docs', 'roadmap.md');
const qaDir = path.join(repoRoot, 'docs', 'qa');
const traceabilityPath = path.join(qaDir, 'traceability-map.json');

const laneTestPrefix = {
  server: 'MealQuestServer/test/',
  merchant: 'MealQuestMerchant/test/',
  customer: 'meal-quest-customer/test/'
};

function fail(message, details = []) {
  console.error(`[check-roadmap-sync] FAILED: ${message}`);
  for (const detail of details) {
    console.error(`  - ${detail}`);
  }
  process.exit(1);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`cannot read file: ${path.relative(repoRoot, filePath)}`, [error.message]);
  }
}

function toPosix(relPath) {
  return relPath.replace(/\\/g, '/');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function parseRoadmapPackages(content) {
  const result = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.startsWith('| PKG-')) {
      continue;
    }
    const cells = rawLine.split('|').map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 7) {
      continue;
    }
    const packageId = cells[0];
    const lane = cells[1];
    const status = cells[cells.length - 1];
    if (!/^PKG-S\d{3}-(SRV|MER|CUS)-\d+$/.test(packageId)) {
      continue;
    }
    if (!['server', 'merchant', 'customer'].includes(lane)) {
      fail(`invalid lane in roadmap for ${packageId}`, [lane]);
    }
    if (!['todo', 'doing', 'blocked', 'done'].includes(status)) {
      fail(`invalid status in roadmap for ${packageId}`, [status]);
    }
    if (result.has(packageId)) {
      fail('duplicate package id in roadmap', [packageId]);
    }
    result.set(packageId, { lane, status });
  }
  return result;
}

function parseQaPackageIds() {
  const ids = new Set();
  const entries = fs.readdirSync(qaDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith('.md')) {
      continue;
    }
    const stem = entry.name.slice(0, -3);
    if (/^PKG-S\d{3}-(SRV|MER|CUS)-\d+$/.test(stem)) {
      ids.add(stem);
    }
  }
  return ids;
}

function parseTraceability() {
  const raw = readFile(traceabilityPath);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail('traceability-map.json is not valid JSON', [error.message]);
  }
  if (!parsed || !Array.isArray(parsed.packages)) {
    fail('traceability-map.json must contain packages[]');
  }

  const byId = new Map();
  for (const item of parsed.packages) {
    if (!item || typeof item !== 'object') {
      fail('traceability-map.json has invalid package entry');
    }
    const { packageId, lane, status, codeRefs, testRefs } = item;
    if (!/^PKG-S\d{3}-(SRV|MER|CUS)-\d+$/.test(String(packageId || ''))) {
      fail('invalid packageId in traceability-map', [String(packageId || '')]);
    }
    if (!['server', 'merchant', 'customer'].includes(lane)) {
      fail(`invalid lane in traceability-map for ${packageId}`, [String(lane)]);
    }
    if (!['todo', 'doing', 'blocked', 'done'].includes(status)) {
      fail(`invalid status in traceability-map for ${packageId}`, [String(status)]);
    }
    if (!Array.isArray(codeRefs) || codeRefs.length === 0) {
      fail(`codeRefs is required in traceability-map for ${packageId}`);
    }
    if (!Array.isArray(testRefs)) {
      fail(`testRefs must be an array in traceability-map for ${packageId}`);
    }
    if (byId.has(packageId)) {
      fail('duplicate packageId in traceability-map', [packageId]);
    }
    byId.set(packageId, item);
  }

  return { parsed, byId };
}

function collectTestFiles(rootRelPath) {
  const start = path.join(repoRoot, rootRelPath);
  if (!fs.existsSync(start)) {
    return [];
  }
  const found = [];
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!/\.(test|spec)\.(js|ts|tsx)$/.test(entry.name)) {
        continue;
      }
      found.push(toPosix(path.relative(repoRoot, fullPath)));
    }
  }
  return found.sort();
}

function ensureNoS120Plus(roadmapIds, qaIds, traceIds, referencedTests, actualTests) {
  const offending = [];
  const idPattern = /^PKG-S1[2-9]\d-(SRV|MER|CUS)-\d+$/;
  for (const id of roadmapIds) {
    if (idPattern.test(id)) offending.push(`roadmap package: ${id}`);
  }
  for (const id of qaIds) {
    if (idPattern.test(id)) offending.push(`qa package: ${id}`);
  }
  for (const id of traceIds) {
    if (idPattern.test(id)) offending.push(`trace package: ${id}`);
  }

  const stepPattern = /\.s1[2-9]\d\./;
  for (const file of [...referencedTests, ...actualTests]) {
    if (stepPattern.test(file.toLowerCase())) {
      offending.push(`s120+ test file: ${file}`);
    }
  }

  if (offending.length > 0) {
    fail('found S120+ artifacts, but current roadmap source only goes to S110', offending);
  }
}

const roadmapContent = readFile(roadmapPath);
const roadmapPackages = parseRoadmapPackages(roadmapContent);
const qaPackageIds = parseQaPackageIds();
const { byId: tracePackages } = parseTraceability();

const roadmapIds = new Set(roadmapPackages.keys());
const traceIds = new Set(tracePackages.keys());

const missingQa = [...roadmapIds].filter((id) => !qaPackageIds.has(id));
const extraQa = [...qaPackageIds].filter((id) => !roadmapIds.has(id));
const missingTrace = [...roadmapIds].filter((id) => !traceIds.has(id));
const extraTrace = [...traceIds].filter((id) => !roadmapIds.has(id));

if (missingQa.length || extraQa.length || missingTrace.length || extraTrace.length) {
  const details = [];
  for (const id of missingQa.sort()) details.push(`missing qa record: ${id}`);
  for (const id of extraQa.sort()) details.push(`orphan qa record: ${id}`);
  for (const id of missingTrace.sort()) details.push(`missing traceability entry: ${id}`);
  for (const id of extraTrace.sort()) details.push(`orphan traceability entry: ${id}`);
  fail('roadmap/qa/traceability package sets are inconsistent', details);
}

const referencedTests = new Set();
for (const [packageId, roadmapMeta] of roadmapPackages.entries()) {
  const traceMeta = tracePackages.get(packageId);
  if (traceMeta.lane !== roadmapMeta.lane) {
    fail(`lane mismatch for ${packageId}`, [`roadmap=${roadmapMeta.lane}`, `trace=${traceMeta.lane}`]);
  }
  if (traceMeta.status !== roadmapMeta.status) {
    fail(`status mismatch for ${packageId}`, [`roadmap=${roadmapMeta.status}`, `trace=${traceMeta.status}`]);
  }

  for (const codeRef of traceMeta.codeRefs) {
    const normalized = toPosix(String(codeRef || ''));
    if (!normalized) {
      fail(`empty codeRef in ${packageId}`);
    }
    if (!fileExists(normalized)) {
      fail(`codeRef not found for ${packageId}`, [normalized]);
    }
  }

  if (roadmapMeta.status === 'done' && traceMeta.testRefs.length === 0) {
    fail(`done package has no automated test refs: ${packageId}`);
  }

  for (const testRef of traceMeta.testRefs) {
    const normalized = toPosix(String(testRef || ''));
    if (!normalized) {
      fail(`empty testRef in ${packageId}`);
    }
    if (!/\.(test|spec)\.(js|ts|tsx)$/.test(normalized)) {
      fail(`testRef must point to *.test|*.spec file for ${packageId}`, [normalized]);
    }
    if (!normalized.startsWith(laneTestPrefix[roadmapMeta.lane])) {
      fail(`testRef lane mismatch for ${packageId}`, [normalized]);
    }
    if (!fileExists(normalized)) {
      fail(`testRef not found for ${packageId}`, [normalized]);
    }
    referencedTests.add(normalized);
  }
}

const serverTests = collectTestFiles('MealQuestServer/test');
const merchantTests = collectTestFiles('MealQuestMerchant/test');
const customerTests = collectTestFiles('meal-quest-customer/test');
const allTests = [...serverTests, ...merchantTests, ...customerTests].sort();

const orphanTests = allTests.filter((testFile) => !referencedTests.has(testFile));
if (orphanTests.length > 0) {
  fail('found test files not mapped by traceability-map (possible stale/old tests)', orphanTests);
}

ensureNoS120Plus(roadmapIds, qaPackageIds, traceIds, [...referencedTests], allTests);

console.log(
  `[check-roadmap-sync] OK (${roadmapIds.size} packages, ${allTests.length} test files mapped, no extra/missing content).`
);
