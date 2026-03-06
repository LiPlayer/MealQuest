#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname);
const roadmapPath = path.join(repoRoot, "docs", "roadmap.md");
const qaDir = path.join(repoRoot, "docs", "qa");

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`[check-qa-coverage] failed to read ${filePath}:`, error.message);
    process.exit(1);
  }
}

function collectRoadmapPackageIds(content) {
  const ids = new Set();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(PKG-[A-Z0-9-]+)\s*\|/);
    if (match) {
      ids.add(match[1]);
    }
  }
  return Array.from(ids).sort();
}

function collectQaPackageIds(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.error(`[check-qa-coverage] qa directory not found: ${dirPath}`);
    process.exit(1);
  }
  const ids = new Set();
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith(".md")) {
      continue;
    }
    const stem = entry.name.slice(0, -3);
    if (stem.startsWith("PKG-")) {
      ids.add(stem);
    }
  }
  return Array.from(ids).sort();
}

function printList(title, rows) {
  console.error(`[check-qa-coverage] ${title}:`);
  for (const row of rows) {
    console.error(`  - ${row}`);
  }
}

const roadmapContent = readFileSafe(roadmapPath);
const roadmapPackageIds = collectRoadmapPackageIds(roadmapContent);
const qaPackageIds = collectQaPackageIds(qaDir);

const missingQa = roadmapPackageIds.filter((id) => !qaPackageIds.includes(id));
const extraQa = qaPackageIds.filter((id) => !roadmapPackageIds.includes(id));

if (missingQa.length > 0 || extraQa.length > 0) {
  console.error("[check-qa-coverage] FAILED: docs/roadmap package list and docs/qa records are inconsistent.");
  if (missingQa.length > 0) {
    printList("missing qa records", missingQa);
  }
  if (extraQa.length > 0) {
    printList("orphan qa records", extraQa);
  }
  process.exit(1);
}

console.log(
  `[check-qa-coverage] OK (${roadmapPackageIds.length} package(s), ${qaPackageIds.length} qa record(s)).`
);
