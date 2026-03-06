const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createPolicyLedgerService } = require("../src/policyos/ledgerService");

test("policy ledger grant is idempotent and reconcileable", () => {
  const db = createInMemoryDb();
  db.save = () => {};
  const merchantId = "m_ledger";
  db.merchants[merchantId] = {
    merchantId,
    name: "Ledger Merchant",
    killSwitchEnabled: false
  };
  db.merchantUsers[merchantId] = {
    u_001: {
      uid: "u_001",
      displayName: "Ledger User",
      wallet: {
        principal: 10,
        bonus: 1,
        silver: 0
      },
      tags: [],
      fragments: {},
      vouchers: []
    }
  };

  const ledgerService = createPolicyLedgerService(db);
  const user = db.merchantUsers[merchantId].u_001;
  const first = ledgerService.grant({
    merchantId,
    user,
    account: "bonus",
    amount: 5,
    idempotencyKey: "policyos_grant_1"
  });
  const second = ledgerService.grant({
    merchantId,
    user,
    account: "bonus",
    amount: 5,
    idempotencyKey: "policyos_grant_1"
  });
  assert.equal(first.txnId, second.txnId);
  assert.equal(user.wallet.bonus, 6);

  const reconcile = ledgerService.reconcileMerchant({ merchantId });
  assert.equal(reconcile.balanced, true);
});

test("policy ledger clawback follows bonus-first rule", () => {
  const db = createInMemoryDb();
  db.save = () => {};
  const merchantId = "m_ledger";
  db.merchants[merchantId] = {
    merchantId,
    name: "Ledger Merchant",
    killSwitchEnabled: false
  };
  db.merchantUsers[merchantId] = {
    u_001: {
      uid: "u_001",
      displayName: "Ledger User",
      wallet: {
        principal: 100,
        bonus: 20,
        silver: 0
      },
      tags: [],
      fragments: {},
      vouchers: []
    }
  };

  const ledgerService = createPolicyLedgerService(db);
  const user = db.merchantUsers[merchantId].u_001;
  const clawback = ledgerService.clawbackRefund({
    merchantId,
    user,
    refundAmount: 30,
    bonusConsumed: 25,
    idempotencyKey: "policyos_clawback_1"
  });
  assert.equal(clawback.clawback.fromBonus, 20);
  assert.equal(clawback.clawback.fromPrincipal, 5);
  assert.equal(user.wallet.bonus, 0);
  assert.equal(user.wallet.principal, 125);
});
