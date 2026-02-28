function ensureObject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input;
}

function ensurePolicyOsState(db) {
  if (!db || typeof db !== "object") {
    throw new Error("db is required");
  }
  db.policyOs = ensureObject(db.policyOs);
  db.policyOs.templates = ensureObject(db.policyOs.templates);
  db.policyOs.drafts = ensureObject(db.policyOs.drafts);
  db.policyOs.policies = ensureObject(db.policyOs.policies);
  db.policyOs.executionPlans = ensureObject(db.policyOs.executionPlans);
  db.policyOs.decisions = ensureObject(db.policyOs.decisions);
  db.policyOs.approvals = ensureObject(db.policyOs.approvals);
  db.policyOs.publishedByMerchant = ensureObject(db.policyOs.publishedByMerchant);
  db.policyOs.resourceStates = ensureObject(db.policyOs.resourceStates);
  db.policyOs.resourceStates.budget = ensureObject(db.policyOs.resourceStates.budget);
  db.policyOs.resourceStates.inventory = ensureObject(db.policyOs.resourceStates.inventory);
  db.policyOs.resourceStates.frequency = ensureObject(db.policyOs.resourceStates.frequency);
  db.policyOs.dispatcher = ensureObject(db.policyOs.dispatcher);
  db.policyOs.dispatcher.sequenceByMerchant = ensureObject(db.policyOs.dispatcher.sequenceByMerchant);
  db.policyOs.dispatcher.dedupe = ensureObject(db.policyOs.dispatcher.dedupe);
  db.policyOs.compliance = ensureObject(db.policyOs.compliance);
  if (!Array.isArray(db.policyOs.compliance.behaviorLogs)) {
    db.policyOs.compliance.behaviorLogs = [];
  }
  if (!Array.isArray(db.policyOs.compliance.deletionQueue)) {
    db.policyOs.compliance.deletionQueue = [];
  }
  return db.policyOs;
}

function createPolicyId(policyKey, version) {
  return `${policyKey}@v${version}`;
}

module.exports = {
  ensurePolicyOsState,
  createPolicyId
};
