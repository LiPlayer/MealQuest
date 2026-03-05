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

export type GovernanceOverviewResponse = {
  merchantId: string;
  pendingApprovalCount: number;
  approvedAwaitPublishCount: number;
  activePolicyCount: number;
  pausedPolicyCount: number;
  killSwitchEnabled: boolean;
  decision24h: {
    hit: number;
    blocked: number;
    noPolicy: number;
    total: number;
  };
  audit24h: {
    success: number;
    blocked: number;
    failed: number;
    total: number;
  };
  lastUpdatedAt: string | null;
};

export type GovernanceApprovalsStatus = 'ALL' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED';

export type GovernanceApprovalItem = {
  draftId: string;
  policyKey: string;
  policyName: string;
  status: GovernanceApprovalsStatus;
  submittedAt: string | null;
  submittedBy: string | null;
  approvalId: string | null;
  approvedAt: string | null;
  approverId: string | null;
  publishedPolicyId: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
};

export type GovernanceApprovalsResponse = {
  merchantId: string;
  status: GovernanceApprovalsStatus;
  items: GovernanceApprovalItem[];
  pageInfo: {
    limit: number;
    returned: number;
    total: number;
  };
};

export type GovernanceReplayMode = 'EXECUTE' | 'EVALUATE';
export type GovernanceReplayOutcome = 'ALL' | 'HIT' | 'BLOCKED' | 'NO_POLICY';

export type GovernanceReplayItem = {
  decisionId: string;
  traceId: string;
  event: string;
  mode: GovernanceReplayMode;
  userId: string;
  outcome: Exclude<GovernanceReplayOutcome, 'ALL'>;
  executed: unknown[];
  rejected: unknown[];
  reasonCodes: string[];
  createdAt: string;
};

export type GovernanceReplaysResponse = {
  merchantId: string;
  event: string | null;
  mode: GovernanceReplayMode;
  outcome: GovernanceReplayOutcome;
  items: GovernanceReplayItem[];
  pageInfo: {
    limit: number;
    returned: number;
    total: number;
  };
};

export type PolicyLifecycleResult = {
  merchantId?: string;
  draft?: {
    draft_id?: string;
    status?: string;
    approval_id?: string;
    published_policy_id?: string;
  };
  policy?: {
    policy_id?: string;
    policy_key?: string;
    status?: string;
    published_at?: string;
    updated_at?: string;
  };
  approvalId?: string;
  approvalToken?: string;
};

export type PolicyRecord = {
  policy_id: string;
  policy_key: string;
  name: string;
  status: string;
  published_at?: string | null;
  updated_at?: string | null;
};

export type PolicyListResponse = {
  merchantId: string;
  items: PolicyRecord[];
};

export type KillSwitchResponse = {
  merchantId: string;
  killSwitchEnabled: boolean;
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

export async function getPolicyGovernanceOverview(params: {
  merchantId: string;
  token: string;
}): Promise<GovernanceOverviewResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<GovernanceOverviewResponse>(
    `/api/policyos/governance/overview?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}

export async function getPolicyGovernanceApprovals(params: {
  merchantId: string;
  token: string;
  status?: GovernanceApprovalsStatus;
  limit?: number;
}): Promise<GovernanceApprovalsResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const status = String(params.status || 'ALL').trim().toUpperCase();
  const limit = Math.min(Math.max(Math.floor(Number(params.limit) || 20), 1), 100);
  return getJson<GovernanceApprovalsResponse>(
    `/api/policyos/governance/approvals?merchantId=${encodeURIComponent(merchantId)}&status=${encodeURIComponent(status)}&limit=${limit}`,
    { token: params.token },
  );
}

export async function getPolicyGovernanceReplays(params: {
  merchantId: string;
  token: string;
  event?: string;
  mode?: GovernanceReplayMode;
  outcome?: GovernanceReplayOutcome;
  limit?: number;
}): Promise<GovernanceReplaysResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const event = String(params.event || '').trim().toUpperCase();
  const mode = String(params.mode || 'EXECUTE').trim().toUpperCase();
  const outcome = String(params.outcome || 'ALL').trim().toUpperCase();
  const limit = Math.min(Math.max(Math.floor(Number(params.limit) || 20), 1), 100);
  const query = [
    `merchantId=${encodeURIComponent(merchantId)}`,
    `mode=${encodeURIComponent(mode)}`,
    `outcome=${encodeURIComponent(outcome)}`,
    `limit=${limit}`,
    event ? `event=${encodeURIComponent(event)}` : '',
  ]
    .filter(Boolean)
    .join('&');
  return getJson<GovernanceReplaysResponse>(`/api/policyos/governance/replays?${query}`, {
    token: params.token,
  });
}

export async function approvePolicyDraft(params: {
  merchantId: string;
  draftId: string;
  token: string;
}): Promise<PolicyLifecycleResult> {
  const merchantId = String(params.merchantId || '').trim();
  const draftId = String(params.draftId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!draftId) {
    throw new Error('draftId is required');
  }
  return postJson<PolicyLifecycleResult>(
    `/api/policyos/drafts/${encodeURIComponent(draftId)}/approve`,
    { merchantId },
    { token: params.token },
  );
}

export async function publishPolicyDraft(params: {
  merchantId: string;
  draftId: string;
  token: string;
  approvalId?: string | null;
  approvalToken?: string | null;
}): Promise<PolicyLifecycleResult> {
  const merchantId = String(params.merchantId || '').trim();
  const draftId = String(params.draftId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!draftId) {
    throw new Error('draftId is required');
  }
  return postJson<PolicyLifecycleResult>(
    `/api/policyos/drafts/${encodeURIComponent(draftId)}/publish`,
    {
      merchantId,
      approvalId: params.approvalId || undefined,
      approvalToken: params.approvalToken || undefined,
    },
    { token: params.token },
  );
}

export async function getPolicies(params: {
  merchantId: string;
  token: string;
  includeInactive?: boolean;
}): Promise<PolicyListResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const includeInactive = Boolean(params.includeInactive);
  return getJson<PolicyListResponse>(
    `/api/policyos/policies?merchantId=${encodeURIComponent(merchantId)}&includeInactive=${includeInactive ? 'true' : 'false'}`,
    { token: params.token },
  );
}

export async function pausePolicy(params: {
  merchantId: string;
  policyId: string;
  token: string;
  reason?: string;
}): Promise<{ merchantId: string; policy: PolicyRecord }> {
  const merchantId = String(params.merchantId || '').trim();
  const policyId = String(params.policyId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!policyId) {
    throw new Error('policyId is required');
  }
  return postJson<{ merchantId: string; policy: PolicyRecord }>(
    `/api/policyos/policies/${encodeURIComponent(policyId)}/pause`,
    {
      merchantId,
      reason: String(params.reason || '').trim() || undefined,
    },
    { token: params.token },
  );
}

export async function resumePolicy(params: {
  merchantId: string;
  policyId: string;
  token: string;
}): Promise<{ merchantId: string; policy: PolicyRecord }> {
  const merchantId = String(params.merchantId || '').trim();
  const policyId = String(params.policyId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!policyId) {
    throw new Error('policyId is required');
  }
  return postJson<{ merchantId: string; policy: PolicyRecord }>(
    `/api/policyos/policies/${encodeURIComponent(policyId)}/resume`,
    { merchantId },
    { token: params.token },
  );
}

export async function setMerchantKillSwitch(params: {
  merchantId: string;
  token: string;
  enabled: boolean;
}): Promise<KillSwitchResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return postJson<KillSwitchResponse>(
    '/api/merchant/kill-switch',
    {
      merchantId,
      enabled: Boolean(params.enabled),
    },
    { token: params.token },
  );
}
