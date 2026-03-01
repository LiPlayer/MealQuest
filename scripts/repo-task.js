#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const projects = {
  server: {
    name: "MealQuestServer",
    cwd: path.join(repoRoot, "MealQuestServer"),
    commands: {
      bootstrap: ["ci"],
      typecheck: ["run", "typecheck"],
      test: ["test"],
    },
  },
  merchant: {
    name: "MealQuestMerchant",
    cwd: path.join(repoRoot, "MealQuestMerchant"),
    commands: {
      bootstrap: ["ci"],
      lint: ["run", "lint"],
      typecheck: ["run", "typecheck"],
      test: ["test", "--", "--runInBand"],
    },
  },
  customer: {
    name: "meal-quest-customer",
    cwd: path.join(repoRoot, "meal-quest-customer"),
    commands: {
      bootstrap: ["ci"],
      lint: ["run", "lint"],
      typecheck: ["run", "typecheck"],
      test: ["test", "--", "--runInBand"],
    },
  },
};

const flowMap = {
  bootstrap: ["bootstrap"],
  lint: ["lint"],
  typecheck: ["typecheck"],
  test: ["test"],
  verify: ["lint", "typecheck", "test"],
  ci: ["bootstrap", "lint", "typecheck", "test"],
};

const task = process.argv[2] || "verify";
if (!flowMap[task]) {
  console.error(`[repo-task] Unsupported task: ${task}`);
  console.error(`[repo-task] Supported tasks: ${Object.keys(flowMap).join(", ")}`);
  process.exit(1);
}

const stepList = flowMap[task];

for (const step of stepList) {
  for (const project of Object.values(projects)) {
    const args = project.commands[step];
    if (!args) {
      continue;
    }
    if (!fs.existsSync(project.cwd)) {
      console.error(`[repo-task] Missing project directory: ${project.cwd}`);
      process.exit(1);
    }
    console.log(`\n>>> [${step}] ${project.name}: npm ${args.join(" ")}`);
    const extraEnv =
      project.name === "MealQuestServer" && step === "test"
        ? { HOST: "127.0.0.1" }
        : {};
    const result = spawnSync(npmCmd, args, {
      cwd: project.cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        ...extraEnv,
      },
    });
    if (result.status !== 0) {
      console.error(`[repo-task] Failed: ${project.name} (${step})`);
      process.exit(result.status || 1);
    }
  }
}

console.log(`\n[repo-task] Completed task: ${task}`);
