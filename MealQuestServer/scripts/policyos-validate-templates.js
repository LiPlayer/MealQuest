const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyOsService } = require("../src/policyos/policyOsService");
const { validateStrategyTemplates } = require("../src/services/strategyTemplateCatalog");

function main() {
  const db = createInMemoryDb();
  db.save = () => {};
  const policyOsService = createPolicyOsService(db);
  const knownPlugins = policyOsService.listPlugins();
  const report = validateStrategyTemplates({
    knownPlugins
  });
  if (!report.ok) {
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (require.main === module) {
  main();
}
