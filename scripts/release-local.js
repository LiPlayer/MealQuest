const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runTask(task) {
  const startedAt = Date.now();
  console.log(`\n[release] >>> ${task.name}`);
  console.log(`[release] cwd=${task.cwd}`);
  console.log(`[release] cmd=${task.command} ${task.args.join(" ")}`);

  const result = spawnSync(task.command, task.args, {
    cwd: task.cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  const durationMs = Date.now() - startedAt;
  const ok = result.status === 0;
  console.log(`[release] <<< ${task.name} ${ok ? "PASS" : "FAIL"} (${durationMs}ms)`);
  return {
    ...task,
    ok,
    durationMs,
    exitCode: result.status
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function main() {
  const repoRoot = process.cwd();
  const tasks = [
    {
      name: "Server Test",
      cwd: path.join(repoRoot, "MealQuestServer"),
      command: "npm",
      args: ["test"]
    },
    {
      name: "Server Smoke",
      cwd: path.join(repoRoot, "MealQuestServer"),
      command: "npm",
      args: ["run", "test:smoke"]
    },
    {
      name: "Merchant Test",
      cwd: path.join(repoRoot, "MealQuestMerchant"),
      command: "npm",
      args: ["test", "--", "--runInBand"]
    },
    {
      name: "Merchant Typecheck",
      cwd: path.join(repoRoot, "MealQuestMerchant"),
      command: "npx",
      args: ["tsc", "--noEmit"]
    },
    {
      name: "Customer Test",
      cwd: path.join(repoRoot, "meal-quest-customer"),
      command: "npm",
      args: ["test", "--", "--runInBand"]
    },
    {
      name: "Customer Build Weapp",
      cwd: path.join(repoRoot, "meal-quest-customer"),
      command: "npm",
      args: ["run", "build:weapp"]
    }
  ];

  const results = [];
  for (const task of tasks) {
    const result = runTask(task);
    results.push(result);
    if (!result.ok) {
      break;
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    allPassed: results.every((item) => item.ok),
    results
  };
  const outputDir = path.join(repoRoot, "artifacts");
  ensureDir(outputDir);
  const outputPath = path.join(outputDir, "release-local-report.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("\n[release] summary:");
  for (const item of results) {
    console.log(
      `[release] ${item.ok ? "PASS" : "FAIL"} ${item.name} (${item.durationMs}ms)`
    );
  }
  console.log(`[release] report written: ${outputPath}`);

  if (!summary.allPassed) {
    process.exit(1);
  }
}

main();
