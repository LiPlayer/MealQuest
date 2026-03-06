export type RevenueConfigDraft = {
  minOrderAmount: string;
  voucherValue: string;
  voucherCost: string;
  budgetCap: string;
  frequencyWindowSec: string;
  frequencyMaxHits: string;
  inventorySku: string;
  inventoryMaxUnits: string;
};

export type RevenueConfigPayload = {
  minOrderAmount: number;
  voucherValue: number;
  voucherCost: number;
  budgetCap: number;
  frequencyWindowSec: number;
  frequencyMaxHits: number;
  inventorySku: string;
  inventoryMaxUnits: number;
};

export function parsePositiveNumber(value: string, label: string): number {
  const num = Number(String(value || "").trim());
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return Math.round(num * 100) / 100;
}

export function parsePositiveInt(value: string, label: string): number {
  const num = Number(String(value || "").trim());
  if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return num;
}

export function toRevenueConfigPayload(draft: RevenueConfigDraft): RevenueConfigPayload {
  const inventorySku = String(draft.inventorySku || "").trim();
  if (!inventorySku) {
    throw new Error("inventorySku is required");
  }
  return {
    minOrderAmount: parsePositiveNumber(draft.minOrderAmount, "minOrderAmount"),
    voucherValue: parsePositiveNumber(draft.voucherValue, "voucherValue"),
    voucherCost: parsePositiveNumber(draft.voucherCost, "voucherCost"),
    budgetCap: parsePositiveNumber(draft.budgetCap, "budgetCap"),
    frequencyWindowSec: parsePositiveInt(draft.frequencyWindowSec, "frequencyWindowSec"),
    frequencyMaxHits: parsePositiveInt(draft.frequencyMaxHits, "frequencyMaxHits"),
    inventorySku,
    inventoryMaxUnits: parsePositiveInt(draft.inventoryMaxUnits, "inventoryMaxUnits"),
  };
}

export function parseTrafficPercent(value: string): number {
  const num = Number(String(value || "").trim());
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > 100) {
    throw new Error("流量比例需为 0-100 的整数");
  }
  return num;
}
