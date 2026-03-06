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
  engagementSummary?: DecisionSummaryResponse;
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

export type LifecycleStrategyStage =
  | 'ACQUISITION'
  | 'ACTIVATION'
  | 'ENGAGEMENT'
  | 'EXPANSION'
  | 'RETENTION';

export type LifecycleStrategyItem = {
  stage: LifecycleStrategyStage;
  templateId: string;
  templateName: string;
  category: string;
  triggerEvent: string;
  policyKey: string;
  branchId: string;
  status: string;
  hasPublishedPolicy: boolean;
  lastPolicyId: string | null;
  updatedAt: string | null;
  templateReady?: boolean;
};

export type LifecycleStrategyLibraryResponse = {
  merchantId: string;
  catalogVersion: string;
  catalogUpdatedAt: string;
  items: LifecycleStrategyItem[];
};

export type LifecycleStrategyEnableResponse = {
  merchantId: string;
  stage: LifecycleStrategyStage;
  templateId: string;
  branchId: string;
  policyKey: string;
  status: string;
  hasPublishedPolicy: boolean;
  policyId: string | null;
  alreadyEnabled: boolean;
  updatedAt: string;
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

export type AgentProposalStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
export type AgentProposalDecision = 'APPROVE' | 'REJECT';

export type AgentProposalEvaluationSummary = {
  decisionId: string | null;
  selected: number;
  rejected: number;
  evaluatedAt: string | null;
  cacheKey: string | null;
};

export type AgentProposalExplainSummary = {
  decisionId: string | null;
  selectedCount: number;
  rejectedCount: number;
  evaluatedAt: string | null;
  reasonCodes: string[];
  riskFlags: string[];
  expectedRange: Record<string, unknown> | null;
};

export type AgentProposalReviewItem = {
  proposalId: string;
  status: AgentProposalStatus;
  title: string;
  templateId: string | null;
  branchId: string | null;
  policyDraftId: string | null;
  policyId: string | null;
  policyKey: string | null;
  triggerEvent: string | null;
  budget: Record<string, unknown> | null;
  createdAt: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectedReason: string | null;
  evaluation: AgentProposalEvaluationSummary | null;
  explain: AgentProposalExplainSummary | null;
  suggestedPolicySpec?: Record<string, unknown> | null;
};

export type AgentProposalGenerateResponse = {
  merchantId: string;
  proposal: AgentProposalReviewItem | null;
  created: {
    proposalId?: string;
    title?: string;
    templateId?: string;
    branchId?: string;
    draftId?: string;
    policyKey?: string | null;
  } | null;
};

export type AgentProposalListResponse = {
  merchantId: string;
  status: AgentProposalStatus;
  items: AgentProposalReviewItem[];
  pageInfo: {
    limit: number;
    returned: number;
    total: number;
  };
};

export type AgentProposalDetailResponse = {
  merchantId: string;
  proposal: AgentProposalReviewItem | null;
};

export type AgentProposalEvaluateResponse = {
  proposalId: string;
  draftId: string | null;
  evaluation: Record<string, unknown> | null;
  reused: boolean;
};

export type AgentProposalDecideResponse = {
  decision: AgentProposalDecision;
  proposalId: string;
  status: AgentProposalStatus;
  draftId?: string | null;
  approvalId?: string | null;
  policyId?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectedReason?: string | null;
  evaluation?: Record<string, unknown> | null;
  proposal?: AgentProposalReviewItem | null;
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

export type NotificationStatus = 'ALL' | 'UNREAD' | 'READ';
export type NotificationCategory =
  | 'ALL'
  | 'APPROVAL_TODO'
  | 'EXECUTION_RESULT'
  | 'FEEDBACK_TICKET'
  | 'GENERAL';

export type NotificationInboxItem = {
  notificationId: string;
  merchantId: string;
  recipientType: 'MERCHANT_STAFF' | 'CUSTOMER_USER';
  recipientId: string;
  category: string;
  title: string;
  body: string;
  related: Record<string, unknown>;
  status: 'UNREAD' | 'READ';
  createdAt: string;
  readAt: string | null;
  expiresAt: string | null;
};

export type NotificationInboxResponse = {
  merchantId: string;
  recipientType: 'MERCHANT_STAFF' | 'CUSTOMER_USER';
  recipientId: string;
  status: NotificationStatus;
  category: NotificationCategory;
  items: NotificationInboxItem[];
  pageInfo: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type NotificationUnreadSummaryResponse = {
  merchantId: string;
  recipientType: 'MERCHANT_STAFF' | 'CUSTOMER_USER';
  recipientId: string;
  totalUnread: number;
  byCategory: {
    category: string;
    unreadCount: number;
  }[];
};

export type NotificationReadAckResponse = {
  merchantId: string;
  recipientType: 'MERCHANT_STAFF' | 'CUSTOMER_USER';
  recipientId: string;
  updatedCount: number;
  notificationIds: string[];
};

export type ExperienceGuardPathStatus = 'HEALTHY' | 'WARNING' | 'RISK' | 'NO_DATA';

export type ExperienceGuardPath = {
  pathKey: string;
  title: string;
  status: ExperienceGuardPathStatus;
  score: number;
  metrics: Record<string, number>;
  alerts: string[];
};

export type ExperienceGuardResponse = {
  version: string;
  merchantId: string;
  evaluatedAt: string;
  windowHours: number;
  status: ExperienceGuardPathStatus;
  score: number;
  summary: {
    pathCount: number;
    healthyCount: number;
    warningCount: number;
    riskCount: number;
    noDataCount: number;
  };
  paths: ExperienceGuardPath[];
  alerts: {
    pathKey: string;
    status: ExperienceGuardPathStatus;
    message: string;
  }[];
};

export type ReleaseGateFinalStatus = 'GO' | 'NO_GO' | 'NEEDS_REVIEW';
export type ReleaseGateStatus = 'PASS' | 'FAIL' | 'REVIEW';

export type ReleaseGateItem = {
  status: ReleaseGateStatus;
  reasons: string[];
};

export type ReleaseGateResponse = {
  version: string;
  merchantId: string;
  objective: string;
  evaluatedAt: string;
  windowDays: number;
  trendWindowDays: number;
  kpis: {
    MerchantNetProfit30: number;
    LongTermValueIndex: number;
    MerchantProfitUplift30: number;
    MerchantRevenueUplift30: number;
    UpliftHitRate30: number;
    Retention30: number;
    SubsidyWasteProxy: number;
    PlatformCost30: number;
    PlatformCost30Observed: boolean;
    paymentSuccessRate30: number;
    riskLossProxy30: number;
  };
  gates: {
    businessGate: ReleaseGateItem;
    technicalGate: ReleaseGateItem;
    riskGate: ReleaseGateItem;
    complianceGate: ReleaseGateItem;
  };
  dataSufficiency: {
    ready: boolean;
    requirements: Record<string, number>;
    observed: Record<string, number>;
    reasons: string[];
  };
  supportingMetrics: {
    invoiceCoverage30: number;
    privacySuccessRate30: number;
    marketingCost30: number;
    profitTrendDelta7: number;
  };
  config: {
    thresholds: Record<string, unknown>;
    weights: Record<string, number>;
  };
  finalDecision: {
    status: ReleaseGateFinalStatus;
    reasons: string[];
  };
};

export type FeedbackSummaryTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type FeedbackSummaryTicketCategory = 'PAYMENT' | 'BENEFIT' | 'PRIVACY' | 'ACCOUNT' | 'OTHER';

export type FeedbackSummaryResponse = {
  merchantId: string;
  windowHours: number;
  generatedAt: string;
  totals: {
    tickets: number;
    unresolvedCount: number;
    resolvedCount: number;
  };
  byStatus: {
    status: FeedbackSummaryTicketStatus;
    count: number;
  }[];
  byCategory: {
    category: FeedbackSummaryTicketCategory;
    count: number;
  }[];
  latestTickets: {
    ticketId: string;
    merchantId: string;
    userId: string;
    category: FeedbackSummaryTicketCategory;
    title: string;
    description: string;
    contact: string;
    status: FeedbackSummaryTicketStatus;
    createdAt: string;
    updatedAt: string;
  }[];
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

export async function getLifecycleStrategyLibrary(params: {
  merchantId: string;
  token: string;
}): Promise<LifecycleStrategyLibraryResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<LifecycleStrategyLibraryResponse>(
    `/api/merchant/strategy-library?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}

export async function enableLifecycleStrategy(params: {
  merchantId: string;
  templateId: string;
  token: string;
  branchId?: string;
}): Promise<LifecycleStrategyEnableResponse> {
  const merchantId = String(params.merchantId || '').trim();
  const templateId = String(params.templateId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!templateId) {
    throw new Error('templateId is required');
  }
  const branchId = String(params.branchId || '').trim();
  return postJson<LifecycleStrategyEnableResponse>(
    `/api/merchant/strategy-library/${encodeURIComponent(templateId)}/enable`,
    {
      merchantId,
      branchId: branchId || undefined,
    },
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

export async function generateAgentProposal(params: {
  merchantId: string;
  token: string;
  intent: string;
  templateId?: string;
  branchId?: string;
  sessionId?: string;
}): Promise<AgentProposalGenerateResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return postJson<AgentProposalGenerateResponse>(
    '/api/agent-os/proposals/generate',
    {
      merchantId,
      intent: String(params.intent || '').trim(),
      templateId: String(params.templateId || '').trim() || undefined,
      branchId: String(params.branchId || '').trim() || undefined,
      sessionId: String(params.sessionId || '').trim() || undefined,
    },
    { token: params.token },
  );
}

export async function getAgentProposalReviews(params: {
  merchantId: string;
  token: string;
  status?: AgentProposalStatus;
  limit?: number;
}): Promise<AgentProposalListResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const status = String(params.status || 'ALL').trim().toUpperCase();
  const limit = Math.min(Math.max(Math.floor(Number(params.limit) || 20), 1), 100);
  return getJson<AgentProposalListResponse>(
    `/api/agent-os/proposals?merchantId=${encodeURIComponent(merchantId)}&status=${encodeURIComponent(status)}&limit=${limit}`,
    { token: params.token },
  );
}

export async function getAgentProposalDetail(params: {
  merchantId: string;
  proposalId: string;
  token: string;
}): Promise<AgentProposalDetailResponse> {
  const merchantId = String(params.merchantId || '').trim();
  const proposalId = String(params.proposalId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!proposalId) {
    throw new Error('proposalId is required');
  }
  return getJson<AgentProposalDetailResponse>(
    `/api/agent-os/proposals/${encodeURIComponent(proposalId)}?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}

export async function evaluateAgentProposal(params: {
  merchantId: string;
  proposalId: string;
  token: string;
  userId?: string;
  event?: string;
  forceRefresh?: boolean;
}): Promise<AgentProposalEvaluateResponse> {
  const merchantId = String(params.merchantId || '').trim();
  const proposalId = String(params.proposalId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!proposalId) {
    throw new Error('proposalId is required');
  }
  return postJson<AgentProposalEvaluateResponse>(
    `/api/agent-os/proposals/${encodeURIComponent(proposalId)}/evaluate`,
    {
      merchantId,
      userId: String(params.userId || '').trim() || undefined,
      event: String(params.event || '').trim() || undefined,
      forceRefresh: Boolean(params.forceRefresh),
    },
    { token: params.token },
  );
}

export async function decideAgentProposal(params: {
  merchantId: string;
  proposalId: string;
  decision: AgentProposalDecision;
  token: string;
  reason?: string;
  userId?: string;
  event?: string;
  forceRefresh?: boolean;
}): Promise<AgentProposalDecideResponse> {
  const merchantId = String(params.merchantId || '').trim();
  const proposalId = String(params.proposalId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!proposalId) {
    throw new Error('proposalId is required');
  }
  return postJson<AgentProposalDecideResponse>(
    `/api/agent-os/proposals/${encodeURIComponent(proposalId)}/decide`,
    {
      merchantId,
      decision: String(params.decision || '').trim().toUpperCase(),
      reason: String(params.reason || '').trim() || undefined,
      userId: String(params.userId || '').trim() || undefined,
      event: String(params.event || '').trim() || undefined,
      forceRefresh: Boolean(params.forceRefresh),
    },
    { token: params.token },
  );
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

export async function getCustomerExperienceGuard(params: {
  merchantId: string;
  token: string;
  windowHours?: number;
}): Promise<ExperienceGuardResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const windowHours = Number(params.windowHours);
  const query = [
    `merchantId=${encodeURIComponent(merchantId)}`,
    Number.isFinite(windowHours) && windowHours > 0
      ? `windowHours=${encodeURIComponent(String(Math.floor(windowHours)))}`
      : '',
  ]
    .filter(Boolean)
    .join('&');
  return getJson<ExperienceGuardResponse>(`/api/state/experience-guard?${query}`, {
    token: params.token,
  });
}

export async function getReleaseGateSnapshot(params: {
  merchantId: string;
  token: string;
  windowDays?: number;
}): Promise<ReleaseGateResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const windowDays = Number(params.windowDays);
  const query = [
    `merchantId=${encodeURIComponent(merchantId)}`,
    Number.isFinite(windowDays) && windowDays > 0
      ? `windowDays=${encodeURIComponent(String(Math.floor(windowDays)))}`
      : '',
  ]
    .filter(Boolean)
    .join('&');
  return getJson<ReleaseGateResponse>(`/api/state/release-gate?${query}`, {
    token: params.token,
  });
}

export async function getFeedbackSummary(params: {
  merchantId: string;
  token: string;
  windowHours?: number;
}): Promise<FeedbackSummaryResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const windowHours = Number(params.windowHours);
  const query = [
    `merchantId=${encodeURIComponent(merchantId)}`,
    Number.isFinite(windowHours) && windowHours > 0
      ? `windowHours=${encodeURIComponent(String(Math.floor(windowHours)))}`
      : '',
  ]
    .filter(Boolean)
    .join('&');
  return getJson<FeedbackSummaryResponse>(`/api/feedback/summary?${query}`, {
    token: params.token,
  });
}

export async function getNotificationInbox(params: {
  merchantId: string;
  token: string;
  status?: NotificationStatus;
  category?: NotificationCategory;
  limit?: number;
  cursor?: string;
}): Promise<NotificationInboxResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const status = String(params.status || 'ALL').trim().toUpperCase();
  const category = String(params.category || 'ALL').trim().toUpperCase();
  const limit = Math.min(Math.max(Math.floor(Number(params.limit) || 20), 1), 100);
  const cursor = String(params.cursor || '').trim();
  const query = [
    `merchantId=${encodeURIComponent(merchantId)}`,
    `status=${encodeURIComponent(status)}`,
    `category=${encodeURIComponent(category)}`,
    `limit=${limit}`,
    cursor ? `cursor=${encodeURIComponent(cursor)}` : '',
  ]
    .filter(Boolean)
    .join('&');
  return getJson<NotificationInboxResponse>(`/api/notifications/inbox?${query}`, {
    token: params.token,
  });
}

export async function getNotificationUnreadSummary(params: {
  merchantId: string;
  token: string;
}): Promise<NotificationUnreadSummaryResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<NotificationUnreadSummaryResponse>(
    `/api/notifications/unread-summary?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}

export async function markNotificationsRead(params: {
  merchantId: string;
  token: string;
  notificationIds?: string[];
  markAll?: boolean;
}): Promise<NotificationReadAckResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const notificationIds = Array.isArray(params.notificationIds)
    ? params.notificationIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const markAll = Boolean(params.markAll);
  if (!markAll && notificationIds.length === 0) {
    throw new Error('notificationIds is required when markAll is false');
  }
  return postJson<NotificationReadAckResponse>(
    '/api/notifications/read',
    {
      merchantId,
      notificationIds,
      markAll,
    },
    { token: params.token },
  );
}
