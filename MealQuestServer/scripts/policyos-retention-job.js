const fs = require("node:fs");
const path = require("node:path");
const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");

function readSnapshot(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw);
}

function writeSnapshot(filePath, state) {
  const resolved = path.resolve(process.cwd(), filePath);
  fs.writeFileSync(resolved, JSON.stringify(state, null, 2), "utf8");
}

function main() {
  const args = process.argv.slice(2);
  const stateFileArg = args.find((item) => item.startsWith("--state="));
  const behaviorDaysArg = args.find((item) => item.startsWith("--behaviorDays="));
  const transactionDaysArg = args.find((item) => item.startsWith("--transactionDays="));
  const stateFile = stateFileArg ? stateFileArg.replace("--state=", "") : "";

  const initialState = stateFile ? readSnapshot(stateFile) : null;
  const db = createInMemoryDb(initialState);
  db.save = () => {};
  const policyOsService = createPolicyOsService(db);
  const result = policyOsService.runRetentionJobs({
    behaviorRetentionDays: behaviorDaysArg ? Number(behaviorDaysArg.replace("--behaviorDays=", "")) : 180,
    transactionRetentionDays: transactionDaysArg ? Number(transactionDaysArg.replace("--transactionDays=", "")) : 365 * 3
  });

  if (stateFile) {
    writeSnapshot(stateFile, db.serialize());
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main();
}
