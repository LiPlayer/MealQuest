const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const contractPath = path.join(repoRoot, "config", "config-contract.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseEnvKeys(filePath) {
  const text = readText(filePath);
  const keys = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function walkFiles(dirPath, exts, acc = []) {
  if (!fs.existsSync(dirPath)) {
    return acc;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, exts, acc);
      continue;
    }
    if (exts.has(path.extname(entry.name).toLowerCase())) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function scanForbiddenPatterns(files, patterns) {
  const errors = [];
  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const text = readText(file);
    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        errors.push(`${rel}: forbidden pattern "${pattern}"`);
      }
    }
  }
  return errors;
}

function requireEnvKeys(envFile, keys) {
  const existing = parseEnvKeys(envFile);
  return keys
    .filter((key) => !existing.has(key))
    .map((key) => `${path.relative(repoRoot, envFile)}: missing key "${key}"`);
}

function main() {
  const contract = readJson(contractPath);
  const errors = [];

  const merchantSrcFiles = walkFiles(
    path.join(repoRoot, "MealQuestMerchant", "src"),
    new Set([".js", ".jsx", ".ts", ".tsx"])
  ).concat(
    walkFiles(path.join(repoRoot, "MealQuestMerchant"), new Set([".tsx", ".ts", ".js"]))
      .filter((file) => path.basename(file).toLowerCase() === "app.tsx")
  );
  const customerSrcFiles = walkFiles(
    path.join(repoRoot, "meal-quest-customer", "src"),
    new Set([".js", ".jsx", ".ts", ".tsx"])
  );
  const serverSrcFiles = walkFiles(
    path.join(repoRoot, "MealQuestServer", "src"),
    new Set([".js", ".cjs", ".mjs"])
  );

  errors.push(
    ...scanForbiddenPatterns(
      merchantSrcFiles,
      contract.lintRules.merchant_src_forbid || []
    )
  );
  errors.push(
    ...scanForbiddenPatterns(
      customerSrcFiles,
      contract.lintRules.customer_src_forbid || []
    )
  );
  errors.push(
    ...scanForbiddenPatterns(
      serverSrcFiles,
      contract.lintRules.server_src_forbid || []
    )
  );

  errors.push(
    ...requireEnvKeys(
      path.join(repoRoot, "MealQuestMerchant", ".env"),
      contract.domains.merchant_rn.requiredKeys
    )
  );
  errors.push(
    ...requireEnvKeys(
      path.join(repoRoot, "meal-quest-customer", ".env.development"),
      contract.domains.customer_taro.requiredKeys
    )
  );
  errors.push(
    ...requireEnvKeys(
      path.join(repoRoot, "MealQuestServer", ".env.dev.example"),
      contract.domains.server.requiredKeys
    )
  );

  if (errors.length > 0) {
    console.error("[config-contract] FAIL");
    for (const error of errors) {
      console.error(`[config-contract] ${error}`);
    }
    process.exit(1);
  }

  console.log("[config-contract] PASS");
}

main();

