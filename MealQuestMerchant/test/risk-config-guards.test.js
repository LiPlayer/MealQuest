const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parsePositiveInt,
  parsePositiveNumber,
  parseTrafficPercent,
  toRevenueConfigPayload,
} = require("../.tmp-tests/riskConfigGuards.js");

test("parsePositiveNumber accepts positive number and rounds to cents", () => {
  assert.equal(parsePositiveNumber("12.345", "voucherValue"), 12.35);
});

test("parsePositiveNumber rejects zero or invalid values", () => {
  assert.throws(
    () => parsePositiveNumber("0", "voucherValue"),
    /voucherValue must be a positive number/,
  );
  assert.throws(
    () => parsePositiveNumber("invalid", "voucherValue"),
    /voucherValue must be a positive number/,
  );
});

test("parsePositiveInt accepts positive integers and rejects decimals", () => {
  assert.equal(parsePositiveInt("5", "frequencyMaxHits"), 5);
  assert.throws(
    () => parsePositiveInt("1.5", "frequencyMaxHits"),
    /frequencyMaxHits must be a positive integer/,
  );
});

test("parseTrafficPercent enforces integer range 0-100", () => {
  assert.equal(parseTrafficPercent("0"), 0);
  assert.equal(parseTrafficPercent("100"), 100);
  assert.throws(() => parseTrafficPercent("-1"), /流量比例需为 0-100 的整数/);
  assert.throws(() => parseTrafficPercent("101"), /流量比例需为 0-100 的整数/);
  assert.throws(() => parseTrafficPercent("10.5"), /流量比例需为 0-100 的整数/);
});

test("toRevenueConfigPayload normalizes and validates draft values", () => {
  const payload = toRevenueConfigPayload({
    minOrderAmount: "40",
    voucherValue: "8.5",
    voucherCost: "8",
    budgetCap: "300",
    frequencyWindowSec: "86400",
    frequencyMaxHits: "2",
    inventorySku: " SKU-001 ",
    inventoryMaxUnits: "100",
  });
  assert.deepEqual(payload, {
    minOrderAmount: 40,
    voucherValue: 8.5,
    voucherCost: 8,
    budgetCap: 300,
    frequencyWindowSec: 86400,
    frequencyMaxHits: 2,
    inventorySku: "SKU-001",
    inventoryMaxUnits: 100,
  });
});

test("toRevenueConfigPayload rejects empty inventory sku", () => {
  assert.throws(
    () =>
      toRevenueConfigPayload({
        minOrderAmount: "40",
        voucherValue: "8.5",
        voucherCost: "8",
        budgetCap: "300",
        frequencyWindowSec: "86400",
        frequencyMaxHits: "2",
        inventorySku: " ",
        inventoryMaxUnits: "100",
      }),
    /inventorySku is required/,
  );
});
