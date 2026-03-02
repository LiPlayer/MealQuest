#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const scanStaged = args.has("--staged");
const scanAll = args.has("--all");

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".html",
  ".xml",
  ".txt",
  ".env",
  ".sh",
  ".ps1",
  ".cmd",
  ".bat",
]);

// Skip folders with known legacy mojibake docs to avoid blocking unrelated changes.
const SKIP_PREFIXES = ["node_modules/", ".git/", "docs/archive/", "docs/specs/"];

function toPosixPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function shouldSkipPath(filePath) {
  const posix = toPosixPath(filePath);
  return SKIP_PREFIXES.some((prefix) => posix.startsWith(prefix));
}

function runGit(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`git ${gitArgs.join(" ")} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const error = (result.stderr || result.stdout || "").trim() || "git command failed";
    throw new Error(error);
  }
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listTargetFiles() {
  if (scanAll) {
    return runGit(["ls-files"]);
  }
  if (scanStaged) {
    return runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  }
  const changed = runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(new Set([...changed, ...untracked]));
}

function looksLikeTextFile(filePath) {
  if (toPosixPath(filePath).endsWith(".env")) {
    return true;
  }
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function hasUtf8Bom(buffer) {
  return (
    buffer &&
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  );
}

function firstMatchInfo(content, regex) {
  regex.lastIndex = 0;
  const match = regex.exec(content);
  if (!match) {
    return null;
  }
  const index = match.index;
  const line = content.slice(0, index).split(/\r?\n/).length;
  return { token: match[0], line };
}

function checkFile(filePath) {
  const absolute = path.join(repoRoot, filePath);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    return null;
  }

  const buffer = fs.readFileSync(absolute);
  if (buffer.includes(0x00)) {
    return null;
  }

  const content = buffer.toString("utf8");
  const issues = [];

  if (hasUtf8Bom(buffer)) {
    issues.push({ reason: "UTF-8 BOM detected", line: 1, token: "BOM" });
  }

  const replacementInfo = firstMatchInfo(content, /\uFFFD/u);
  if (replacementInfo) {
    issues.push({
      reason: "replacement character found (possible decode corruption)",
      line: replacementInfo.line,
      token: replacementInfo.token,
    });
  }

  // Typical mojibake tokens when UTF-8 is decoded as ANSI/cp1252/latin1.
  const mojibakePattern =
    /[\u00C2\u00C3][\u0080-\u00BF]|[\u00E5\u00E6\u00E7][^\u0000-\u007F]|\u00EF\u00BF\u00BD|\u00E2\u20AC[\u0090\u0093\u0094\u0098\u0099\u009C\u009D]/u;
  const mojibakeInfo = firstMatchInfo(content, mojibakePattern);
  if (mojibakeInfo) {
    issues.push({
      reason: "suspicious mojibake token found",
      line: mojibakeInfo.line,
      token: mojibakeInfo.token,
    });
  }

  return issues.length > 0 ? issues : null;
}

function main() {
  let files = [];
  try {
    files = listTargetFiles();
  } catch (error) {
    console.error(`[check-encoding] ${error.message}`);
    process.exit(1);
  }

  const candidates = files
    .filter((filePath) => !shouldSkipPath(filePath))
    .filter((filePath) => looksLikeTextFile(filePath));

  if (candidates.length === 0) {
    console.log("[check-encoding] no candidate files to scan.");
    return;
  }

  const findings = [];
  for (const filePath of candidates) {
    const issues = checkFile(filePath);
    if (issues) {
      findings.push({ filePath, issues });
    }
  }

  if (findings.length === 0) {
    console.log(`[check-encoding] OK (${candidates.length} file(s) scanned).`);
    return;
  }

  console.error("[check-encoding] FAILED: encoding issues detected.");
  for (const finding of findings) {
    for (const issue of finding.issues) {
      console.error(
        `- ${finding.filePath}:${issue.line} ${issue.reason} [${issue.token}]`,
      );
    }
  }
  process.exit(2);
}

main();
