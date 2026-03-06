import { apiRequestJson } from '@/adapters/api/client';
import {
  CustomerStabilityDriver,
  CustomerStabilityReason,
  CustomerStabilitySnapshot,
} from '@/services/dataTypes';

import { ensureCustomerSession } from './sessionService';

type StabilityResponse = {
  version?: unknown;
  merchantId?: unknown;
  objective?: unknown;
  evaluatedAt?: unknown;
  windowDays?: unknown;
  stabilityLevel?: unknown;
  stabilityLabel?: unknown;
  summary?: unknown;
  drivers?: unknown[];
  reasons?: unknown[];
};

function toString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toDriver(item: unknown): CustomerStabilityDriver {
  const row = (item || {}) as Record<string, unknown>;
  const status = toString(row.status, 'REVIEW').toUpperCase();
  return {
    code: toString(row.code, 'TECHNICAL_GATE'),
    label: toString(row.label, '稳定性驱动项'),
    status,
  };
}

function toReason(item: unknown): CustomerStabilityReason {
  const row = (item || {}) as Record<string, unknown>;
  return {
    code: toString(row.code, 'UNKNOWN_REASON'),
    message: toString(row.message, '服务状态存在波动，请稍后重试。'),
  };
}

export async function getCustomerStabilitySnapshot(merchantId: string): Promise<CustomerStabilitySnapshot> {
  const safeMerchantId = toString(merchantId);
  if (!safeMerchantId) {
    throw new Error('merchantId is required');
  }
  const session = await ensureCustomerSession(safeMerchantId);
  const response = await apiRequestJson<StabilityResponse>({
    method: 'GET',
    path: `/api/state/customer-stability?merchantId=${encodeURIComponent(safeMerchantId)}`,
    token: session.token,
  });

  return {
    version: toString(response.version, 'S090-SRV-02.v1'),
    merchantId: toString(response.merchantId, safeMerchantId),
    objective: toString(response.objective, 'LONG_TERM_VALUE_MAXIMIZATION'),
    evaluatedAt: toString(response.evaluatedAt, new Date().toISOString()),
    windowDays: Math.max(1, Math.floor(toNumber(response.windowDays, 30))),
    stabilityLevel: toString(response.stabilityLevel, 'WATCH').toUpperCase(),
    stabilityLabel: toString(response.stabilityLabel, '需留意'),
    summary: toString(response.summary, '服务状态需留意，部分能力可能短时波动。'),
    drivers: (Array.isArray(response.drivers) ? response.drivers : []).map((item) => toDriver(item)),
    reasons: (Array.isArray(response.reasons) ? response.reasons : []).map((item) => toReason(item)),
  };
}
