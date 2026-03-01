const test = require("node:test");
const assert = require("node:assert/strict");

const { applyRefundClawback } = require("../src/core/clawback");

test("refund clawback consumes bonus first", () => {
  const result = applyRefundClawback({
    wallet: { principal: 100, bonus: 20, silver: 0 },
    refundAmount: 30,
    bonusConsumed: 12
  });

  assert.deepEqual(result.clawback, {
    reclaimTarget: 12,
    fromBonus: 12,
    fromPrincipal: 0
  });
  assert.deepEqual(result.nextWallet, {
    principal: 130,
    bonus: 8,
    silver: 0
  });
});

test("refund clawback falls back to principal when bonus is not enough", () => {
  const result = applyRefundClawback({
    wallet: { principal: 40, bonus: 2, silver: 0 },
    refundAmount: 10,
    bonusConsumed: 8
  });

  assert.deepEqual(result.clawback, {
    reclaimTarget: 8,
    fromBonus: 2,
    fromPrincipal: 6
  });
  assert.deepEqual(result.nextWallet, {
    principal: 44,
    bonus: 0,
    silver: 0
  });
});
