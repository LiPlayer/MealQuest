import { Platform } from 'react-native';

export type MerchantProfile = {
  role: string;
  merchantId: string | null;
  phone: string;
};

export type MerchantPhoneLoginResult =
  | {
    status: 'BOUND';
    token: string;
    profile: MerchantProfile;
    merchant: {
      merchantId: string;
      name: string;
      ownerPhone?: string;
    };
  }
  | {
    status: 'ONBOARD_REQUIRED';
    onboardingToken: string;
    profile: MerchantProfile;
  };

export type MerchantCompleteOnboardResult = {
  status: 'BOUND';
  token: string;
  profile: MerchantProfile;
  merchant: {
    merchantId: string;
    name: string;
    ownerPhone?: string;
  };
};

export type MerchantStoresResponse = {
  merchantId: string;
  clusterId: string;
  walletShared: boolean;
  tierShared: boolean;
  stores: {
    merchantId: string;
    name: string;
  }[];
};

export type MerchantDashboardResponse = {
  merchantId: string;
  merchantName: string;
  killSwitchEnabled: boolean;
  budgetCap: number;
  budgetUsed: number;
  activePolicyCount: number;
  customerEntry?: {
    totalCustomers?: number;
    newCustomersToday?: number;
    checkinsToday?: number;
    latestCheckinAt?: string | null;
  };
  acquisitionWelcomeSummary?: DecisionSummaryResponse;
  activationRecoverySummary?: DecisionSummaryResponse;
  revenueUpsellSummary?: DecisionSummaryResponse;
  retentionWinbackSummary?: DecisionSummaryResponse;
  gameMarketingSummary?: DecisionSummaryResponse;
  traceSummary?: {
    last24h?: {
      payments?: number;
      ledgerRows?: number;
      invoices?: number;
      audits?: number;
      policyDecisions?: number;
      traceLinkedPayments?: number;
      tracePendingPayments?: number;
    };
    latestTrace?: {
      paymentTxnId?: string;
      userId?: string;
      status?: string;
      createdAt?: string;
      chainComplete?: boolean;
      hasLedger?: boolean;
      hasInvoice?: boolean;
      hasAudit?: boolean;
    }[];
  };
};

export type RevenueStrategyConfig = {
  minOrderAmount: number;
  voucherValue: number;
  voucherCost: number;
  budgetCap: number;
  frequencyWindowSec: number;
  frequencyMaxHits: number;
  inventorySku: string;
  inventoryMaxUnits: number;
};

export type RevenueStrategyConfigResponse = {
  merchantId: string;
  templateId: string;
  policyKey: string;
  status: string;
  hasPublishedPolicy: boolean;
  policyId: string | null;
  config: RevenueStrategyConfig;
  updatedAt: string | null;
};

export type RevenueStrategyRecommendationResponse = {
  merchantId: string;
  templateId: string;
  strategyId: string;
  generatedAt: string;
  baselineConfig: RevenueStrategyConfig;
  recommendedConfig: RevenueStrategyConfig;
  salesSnapshot: {
    ordersPaidCount: number;
    aov: number;
    netRevenue: number;
  };
  rationale: string[];
};

export type DecisionSummaryResponse = {
  hitCount24h?: number;
  blockedCount24h?: number;
  reactivationRate24h?: number;
  topBlockedReasons?: {
    reason?: string;
    count?: number;
  }[];
  latestResults?: {
    decisionId?: string;
    event?: string;
    outcome?: string;
    reasonCode?: string;
    createdAt?: string;
  }[];
};

export type StateContractDomainResponse = {
  sources?: string[];
  primaryKey?: string[];
  requiredFields?: string[];
};

export type StateContractCoverageDomainResponse = {
  records?: number;
  lastUpdatedAt?: string | null;
};

export type StateContractCoverageResponse = {
  merchantId?: string;
  domains?: Record<string, StateContractCoverageDomainResponse>;
  missingDomains?: string[];
  eventCoverage?: string[];
};

export type StateContractResponse = {
  version?: string;
  generatedAt?: string;
  objective?: string;
  proxyMetrics?: string[];
  dataDomains?: Record<string, StateContractDomainResponse>;
  events?: {
    event?: string;
    source?: string;
    domain?: string;
  }[];
  merchantCoverage?: StateContractCoverageResponse | null;
};

export type StateModelContractResponse = {
  version?: string;
  generatedAt?: string;
  objectiveContract?: {
    targetMetric?: string;
    windowDays?: number;
  };
  modelSignals?: {
    field?: string;
    type?: string;
    range?: number[];
    defaultValue?: number;
    required?: boolean;
    description?: string;
  }[];
  decisionFormula?: {
    effectiveProbability?: string;
    expectedValueProxy?: string;
  };
  merchantCoverage?: {
    merchantId?: string;
    publishedPolicyCount?: number;
    modelSignalReadyPolicyCount?: number;
    missingSignalPolicies?: string[];
    lastUpdatedAt?: string | null;
  } | null;
};

const DEFAULT_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3030',
  default: 'http://127.0.0.1:3030',
});

export function getApiBaseUrl(): string {
  const envUrl =
    typeof process.env.EXPO_PUBLIC_MQ_SERVER_URL === 'string'
      ? process.env.EXPO_PUBLIC_MQ_SERVER_URL.trim()
      : '';
  return envUrl || String(DEFAULT_BASE_URL || 'http://127.0.0.1:3030');
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  options: { token?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data.error === 'string' ? data.error : `request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

async function putJson<T>(
  path: string,
  body: Record<string, unknown>,
  options: { token?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data.error === 'string' ? data.error : `request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

async function getJson<T>(
  path: string,
  options: { token?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data.error === 'string' ? data.error : `request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function requestMerchantPhoneCode(phone: string): Promise<void> {
  await postJson('/api/auth/merchant/request-code', { phone });
}

export async function loginMerchantByPhone(params: {
  phone: string;
  code: string;
}): Promise<MerchantPhoneLoginResult> {
  return postJson<MerchantPhoneLoginResult>('/api/auth/merchant/phone-login', {
    phone: params.phone,
    code: params.code,
  });
}

export async function completeMerchantOnboard(params: {
  onboardingToken: string;
  name: string;
}): Promise<MerchantCompleteOnboardResult> {
  return postJson<MerchantCompleteOnboardResult>(
    '/api/auth/merchant/complete-onboard',
    {
      name: params.name,
    },
    { token: params.onboardingToken },
  );
}

export async function getMerchantStores(params: {
  merchantId: string;
  token: string;
}): Promise<MerchantStoresResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<MerchantStoresResponse>(
    `/api/merchant/stores?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}

export async function getMerchantDashboard(params: {
  merchantId: string;
  token: string;
}): Promise<MerchantDashboardResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<MerchantDashboardResponse>(
    `/api/merchant/dashboard?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}

export async function getRevenueStrategyConfig(params: {
  merchantId: string;
  token: string;
}): Promise<RevenueStrategyConfigResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<RevenueStrategyConfigResponse>(
    `/api/merchant/strategy-config/revenue?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}

export async function setRevenueStrategyConfig(params: {
  merchantId: string;
  token: string;
  config: RevenueStrategyConfig;
}): Promise<RevenueStrategyConfigResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return putJson<RevenueStrategyConfigResponse>(
    '/api/merchant/strategy-config/revenue',
    {
      merchantId,
      config: params.config,
    },
    { token: params.token },
  );
}

export async function recommendRevenueStrategyConfig(params: {
  merchantId: string;
  token: string;
}): Promise<RevenueStrategyRecommendationResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return postJson<RevenueStrategyRecommendationResponse>(
    '/api/merchant/strategy-config/revenue/recommend',
    { merchantId },
    { token: params.token },
  );
}

export async function getStateContract(params: {
  merchantId: string;
  token: string;
}): Promise<StateContractResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<StateContractResponse>(
    `/api/state/contract?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}

export async function getStateModelContract(params: {
  merchantId: string;
  token: string;
}): Promise<StateModelContractResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<StateModelContractResponse>(
    `/api/state/model-contract?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}
