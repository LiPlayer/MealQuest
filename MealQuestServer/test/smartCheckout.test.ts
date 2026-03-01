const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCheckoutQuote } = require("../src/core/smartCheckout");

test("smart checkout prioritizes expiring voucher then wallet balance", () => {
  const quote = buildCheckoutQuote({
    orderAmount: 50,
    wallet: { principal: 20, bonus: 10, silver: 5 },
    vouchers: [
      {
        id: "v2",
        value: 8,
        minSpend: 0,
        status: "ACTIVE",
        expiresAt: "2099-01-01T00:00:00.000Z"
      },
      {
        id: "v1",
        value: 15,
        minSpend: 0,
        status: "ACTIVE",
        expiresAt: "2030-01-01T00:00:00.000Z"
      }
    ],
    now: new Date("2026-01-01T00:00:00.000Z")
  });

  assert.equal(quote.selectedVoucher.id, "v1");
  assert.deepEqual(quote.deduction, {
    voucher: 15,
    bonus: 10,
    principal: 20,
    silver: 5,
    external: 0
  });
  assert.equal(quote.payable, 0);
});

test("smart checkout keeps external payable when internal assets are insufficient", () => {
  const quote = buildCheckoutQuote({
    orderAmount: 40,
    wallet: { principal: 5, bonus: 0, silver: 2 },
    vouchers: [],
    now: new Date("2026-01-01T00:00:00.000Z")
  });

  assert.equal(quote.payable, 33);
  assert.equal(quote.deduction.principal, 5);
  assert.equal(quote.deduction.silver, 2);
});
