export interface StrategyTemplateBranch {
  branchId: string;
  name: string;
  description: string;
  recommendedBudgetCap: number;
  recommendedCostPerHit: number;
  recommendedPriority: number;
}

export interface StrategyTemplate {
  templateId: string;
  category: string;
  phase: string;
  name: string;
  description: string;
  triggerEvent: string;
  defaultBranchId: string;
  branches: StrategyTemplateBranch[];
  currentConfig?: {
    templateId: string;
    branchId: string;
    status: string;
    lastProposalId: string | null;
    lastCampaignId: string | null;
    updatedAt: string | null;
  } | null;
}

export interface AuditLogItem {
  auditId: string;
  timestamp: string;
  merchantId: string;
  action: string;
  status: 'SUCCESS' | 'DENIED' | 'FAILED' | 'BLOCKED';
  role: string;
  operatorId: string;
  details: Record<string, unknown>;
}

export interface AuditLogPage {
  merchantId: string;
  items: AuditLogItem[];
  pageInfo: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface TriggerRainEventResult {
  blockedByKillSwitch: boolean;
  executed?: string[];
}

export interface StrategyChatPendingReview {
  proposalId: string;
  status: string;
  title: string;
  templateId: string | null;
  branchId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  triggerEvent: string | null;
  budget: {
    cap?: number;
    used?: number;
    costPerHit?: number;
  } | null;
  createdAt: string | null;
}

export interface StrategyChatMessage {
  messageId: string;
  role: 'SYSTEM' | 'USER' | 'ASSISTANT';
  type: 'TEXT' | 'PROPOSAL_CARD' | 'PROPOSAL_REVIEW' | 'MEMORY_SUMMARY' | 'MEMORY_FACTS';
  text: string;
  proposalId: string | null;
  metadata: Record<string, unknown> | null;
  isStreaming?: boolean;
  streamFullText?: string;
  createdAt: string;
}

export interface StrategyChatReviewProgress {
  totalCandidates: number;
  reviewedCandidates: number;
  pendingCandidates: number;
}

export interface StrategyChatProtocol {
  name: string;
  version: string;
  mode?: string;
  constrained?: boolean;
  sourceFormat?: string;
  schemaVersion?: string;
}

export interface StrategyChatProposalCandidate {
  title: string;
  templateId: string | null;
  branchId: string | null;
  confidence?: number | null;
  campaignName?: string | null;
  priority?: number | null;
  triggerEvent?: string | null;
}

export interface StrategyChatStatePayload {
  merchantId: string;
  protocol?: StrategyChatProtocol;
  sessionId: string | null;
  pendingReview: StrategyChatPendingReview | null;
  pendingReviews?: StrategyChatPendingReview[];
  reviewProgress?: StrategyChatReviewProgress | null;
  messages?: StrategyChatMessage[];
  deltaMessages?: StrategyChatMessage[];
  latestMessageId?: string | null;
  messageCount?: number;
  activeCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    trigger: Record<string, unknown> | null;
    priority: number;
  }>;
  approvedStrategies: Array<{
    proposalId: string;
    campaignId: string;
    title: string;
    templateId: string;
    branchId: string;
    approvedAt: string | null;
  }>;
}

export interface StrategyChatSessionResult extends StrategyChatStatePayload { }

export interface StrategyChatTurnResult extends StrategyChatStatePayload {
  status: 'CHAT_REPLY' | 'PENDING_REVIEW' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'AI_UNAVAILABLE';
  reason?: string;
  reasons?: string[];
  message?: string;
  assistantMessage?: string;
  proposalCandidates?: StrategyChatProposalCandidate[];
  aiProtocol?: StrategyChatProtocol | null;
}

export interface StrategyChatReviewResult extends StrategyChatStatePayload {
  status: 'APPROVED' | 'REJECTED';
  campaignId?: string;
}

export interface StrategyChatMessagePage {
  merchantId: string;
  sessionId: string | null;
  items: StrategyChatMessage[];
  pageInfo: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  latestMessageId: string | null;
}

export interface CampaignStatusResult {
  merchantId: string;
  campaignId: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}


export interface AllianceConfig {
  merchantId: string;
  clusterId: string;
  stores: string[];
  walletShared: boolean;
  tierShared: boolean;
  updatedAt: string;
}

export interface MerchantCatalogItem {
  merchantId: string;
  name: string;
  budgetCap: number;
  budgetUsed: number;
  killSwitchEnabled: boolean;
  onboardedAt: string | null;
}

export interface MerchantCatalogResult {
  items: MerchantCatalogItem[];
  total: number;
}

export interface MerchantOnboardResult {
  merchant: {
    merchantId: string;
    name: string;
    budgetCap: number;
    budgetUsed: number;
    killSwitchEnabled: boolean;
  };
  allianceConfig: AllianceConfig;
}

export interface MerchantPhoneCodeResult {
  phone: string;
  expiresInSec: number;
}

export interface MerchantPhoneLoginResult {
  token: string;
  profile: {
    role: 'OWNER';
    merchantId: string | null;
    phone: string;
  };
}

export interface MerchantContractStatusResult {
  merchantId: string;
  status: 'NOT_SUBMITTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  application: {
    merchantId: string;
    companyName: string;
    licenseNo: string;
    settlementAccount: string;
    contactPhone: string;
    notes?: string;
    submittedAt: string;
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  } | null;
}
