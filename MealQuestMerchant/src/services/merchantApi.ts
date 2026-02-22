import Config from 'react-native-config';
import { MerchantState } from '../domain/merchantEngine';

const BASE_URL = Config.MQ_SERVER_URL;
const DEFAULT_MERCHANT_ID = Config.MQ_MERCHANT_ID || 'm_demo';

if (!BASE_URL) {
  console.warn('[MerchantApi] MQ_SERVER_URL is missing. API calls will fail.');
}
let runtimeMerchantId = DEFAULT_MERCHANT_ID;

type HttpMethod = 'GET' | 'POST';

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

export interface StrategyProposalResult {
  proposalId: string;
  status: 'PENDING' | 'APPROVED';
  title?: string;
  templateId?: string;
  branchId?: string;
  campaignId: string;
}

export interface CampaignStatusResult {
  merchantId: string;
  campaignId: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

export interface FireSaleResult {
  merchantId: string;
  campaignId: string;
  priority: number;
  ttlUntil: string;
}

export interface AllianceConfig {
  merchantId: string;
  clusterId: string;
  stores: string[];
  walletShared: boolean;
  tierShared: boolean;
  updatedAt: string;
}

export interface TreatSession {
  sessionId: string;
  merchantId: string;
  initiatorUserId: string;
  mode: 'GROUP_PAY' | 'MERCHANT_SUBSIDY';
  orderAmount: number;
  subsidyRate: number;
  subsidyCap: number;
  dailySubsidyCap: number;
  totalContributed: number;
  status: 'OPEN' | 'SETTLED' | 'FAILED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
}

export interface SocialRedPacket {
  packetId: string;
  merchantId: string;
  senderUserId: string;
  totalAmount: number;
  totalSlots: number;
  remainingAmount: number;
  remainingSlots: number;
  status: 'ACTIVE' | 'FINISHED' | 'EXPIRED';
}

export interface SocialTransferResult {
  transferId: string;
  merchantId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  createdAt: string;
}

export interface SocialRedPacketClaimResult {
  packetId: string;
  userId: string;
  claimAmount: number;
  packetStatus: 'ACTIVE' | 'FINISHED' | 'EXPIRED';
  remainingAmount: number;
  remainingSlots: number;
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
  seededUsers: string[];
  allianceConfig: AllianceConfig;
}

export interface MerchantPhoneCodeResult {
  phone: string;
  expiresInSec: number;
  debugCode?: string;
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

async function requestJson<T>(
  method: HttpMethod,
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

async function requestPublicJson<T>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

function toMerchantState(payload: {
  dashboard: any;
  campaigns: any[];
  proposals?: any[];
}): MerchantState {
  const pendingFromState = (payload.proposals || []).filter(
    (item: any) => item.status === 'PENDING',
  );
  const pending =
    pendingFromState.length > 0
      ? pendingFromState.map((item: any) => ({
        id: item.id,
        title: item.title,
        status: 'PENDING' as const,
        templateId: item.strategyMeta?.templateId,
        branchId: item.strategyMeta?.branchId,
        campaignDraft: {
          id: item.suggestedCampaign?.id || `${item.id}_draft`,
          name: item.suggestedCampaign?.name || item.title,
          triggerEvent:
            item.suggestedCampaign?.trigger?.event ||
            item.suggestedCampaign?.triggerEvent ||
            'WEATHER_CHANGE',
          condition: {
            field: item.suggestedCampaign?.conditions?.[0]?.field || 'weather',
            equals:
              item.suggestedCampaign?.conditions?.[0]?.value ??
              item.suggestedCampaign?.conditions?.[0]?.equals ??
              'RAIN',
          },
          budget: {
            cap: Number(item.suggestedCampaign?.budget?.cap || 0),
            used: Number(item.suggestedCampaign?.budget?.used || 0),
            costPerHit: Number(item.suggestedCampaign?.budget?.costPerHit || 0),
          },
        },
      }))
      : (payload.dashboard.pendingProposals || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        status: 'PENDING' as const,
        campaignDraft: {
          id: `${item.id}_draft`,
          name: item.title,
          triggerEvent: 'WEATHER_CHANGE' as const,
          condition: { field: 'weather', equals: 'RAIN' },
          budget: { cap: 0, used: 0, costPerHit: 0 },
        },
      }));

  return {
    merchantId: payload.dashboard.merchantId,
    merchantName: payload.dashboard.merchantName,
    killSwitchEnabled: Boolean(payload.dashboard.killSwitchEnabled),
    budgetCap: Number(payload.dashboard.budgetCap || 0),
    budgetUsed: Number(payload.dashboard.budgetUsed || 0),
    pendingProposals: pending,
    activeCampaigns: (payload.campaigns || []).map((campaign: any) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status || 'ACTIVE',
      triggerEvent: campaign.trigger?.event || 'WEATHER_CHANGE',
      condition: {
        field: campaign.conditions?.[0]?.field || 'weather',
        equals:
          campaign.conditions?.[0]?.value ??
          campaign.conditions?.[0]?.equals ??
          'RAIN',
      },
      budget: {
        cap: Number(campaign.budget?.cap || 0),
        used: Number(campaign.budget?.used || 0),
        costPerHit: Number(campaign.budget?.costPerHit || 0),
      },
    })),
  };
}

export const MerchantApi = {
  isConfigured: () => Boolean(BASE_URL),
  getBaseUrl: () => BASE_URL,
  getMerchantId: () => runtimeMerchantId,
  setMerchantId: (merchantId: string) => {
    runtimeMerchantId = String(merchantId || '').trim() || DEFAULT_MERCHANT_ID;
    return runtimeMerchantId;
  },

  getMerchantCatalog: async () => {
    return requestPublicJson<MerchantCatalogResult>('GET', '/api/merchant/catalog');
  },

  onboardMerchant: async (payload: {
    merchantId: string;
    name: string;
    budgetCap?: number;
    seedDemoUsers?: boolean;
  }) => {
    const result = await requestPublicJson<MerchantOnboardResult>(
      'POST',
      '/api/merchant/onboard',
      payload,
    );
    runtimeMerchantId = result.merchant.merchantId;
    return result;
  },

  requestMerchantLoginCode: async (phone: string) => {
    return requestPublicJson<MerchantPhoneCodeResult>(
      'POST',
      '/api/auth/merchant/request-code',
      { phone },
    );
  },

  loginByPhone: async (payload: {
    phone: string;
    code: string;
    merchantId?: string;
  }) => {
    return requestPublicJson<MerchantPhoneLoginResult>(
      'POST',
      '/api/auth/merchant/phone-login',
      payload,
    );
  },

  loginAsMerchant: async (merchantId = runtimeMerchantId) => {
    const response = await fetch(`${BASE_URL}/api/auth/mock-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'OWNER', merchantId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'merchant login failed');
    }
    return data.token as string;
  },

  getState: async (token: string, merchantId = runtimeMerchantId) => {
    const state = await requestJson<any>(
      'GET',
      `/api/state?merchantId=${encodeURIComponent(
        merchantId,
      )}&userId=${encodeURIComponent('u_demo')}`,
      token,
    );
    return toMerchantState({
      dashboard: state.dashboard,
      campaigns: state.campaigns,
      proposals: state.proposals,
    });
  },

  approveProposal: async (
    token: string,
    proposalId: string,
    merchantId = runtimeMerchantId,
  ) => {
    return requestJson(
      'POST',
      `/api/merchant/proposals/${proposalId}/confirm`,
      token,
      { merchantId, operatorId: 'staff_owner' },
    );
  },

  setKillSwitch: async (
    token: string,
    enabled: boolean,
    merchantId = runtimeMerchantId,
  ) => {
    return requestJson('POST', '/api/merchant/kill-switch', token, {
      merchantId,
      enabled,
    });
  },

  triggerRainEvent: async (
    token: string,
    merchantId = runtimeMerchantId,
  ): Promise<TriggerRainEventResult> => {
    return MerchantApi.triggerEvent(token, 'WEATHER_CHANGE', { weather: 'RAIN' }, merchantId);
  },

  triggerEvent: async (
    token: string,
    event: string,
    context: Record<string, string | boolean | number>,
    merchantId = runtimeMerchantId,
    userId = 'u_demo',
  ): Promise<TriggerRainEventResult> => {
    return requestJson<TriggerRainEventResult>('POST', '/api/tca/trigger', token, {
      merchantId,
      userId,
      event,
      context,
    });
  },

  getStrategyLibrary: async (token: string, merchantId = runtimeMerchantId) => {
    return requestJson<{ merchantId: string; templates: StrategyTemplate[] }>(
      'GET',
      `/api/merchant/strategy-library?merchantId=${encodeURIComponent(merchantId)}`,
      token,
    );
  },

  getStrategyConfigs: async (token: string, merchantId = runtimeMerchantId) => {
    return requestJson<{ merchantId: string; items: any[] }>(
      'GET',
      `/api/merchant/strategy-configs?merchantId=${encodeURIComponent(merchantId)}`,
      token,
    );
  },

  createStrategyProposal: async (
    token: string,
    payload: {
      templateId: string;
      branchId?: string;
      intent?: string;
      overrides?: Record<string, unknown>;
      merchantId?: string;
    },
  ) => {
    return requestJson<StrategyProposalResult>(
      'POST',
      '/api/merchant/strategy-proposals',
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        templateId: payload.templateId,
        branchId: payload.branchId,
        intent: payload.intent,
        overrides: payload.overrides || {},
      },
    );
  },

  setCampaignStatus: async (
    token: string,
    payload: {
      campaignId: string;
      status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
      merchantId?: string;
    },
  ) => {
    return requestJson<CampaignStatusResult>(
      'POST',
      `/api/merchant/campaigns/${encodeURIComponent(payload.campaignId)}/status`,
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        status: payload.status,
      },
    );
  },

  createFireSale: async (
    token: string,
    payload: {
      merchantId?: string;
      targetSku: string;
      ttlMinutes?: number;
      voucherValue?: number;
      maxQty?: number;
    },
  ) => {
    return requestJson<FireSaleResult>('POST', '/api/merchant/fire-sale', token, {
      merchantId: payload.merchantId || runtimeMerchantId,
      targetSku: payload.targetSku,
      ttlMinutes: payload.ttlMinutes,
      voucherValue: payload.voucherValue,
      maxQty: payload.maxQty,
    });
  },

  getAllianceConfig: async (token: string, merchantId = runtimeMerchantId) => {
    return requestJson<AllianceConfig>(
      'GET',
      `/api/merchant/alliance-config?merchantId=${encodeURIComponent(merchantId)}`,
      token,
    );
  },

  setAllianceConfig: async (
    token: string,
    payload: {
      merchantId?: string;
      clusterId?: string;
      stores?: string[];
      walletShared?: boolean;
      tierShared?: boolean;
    },
  ) => {
    return requestJson<AllianceConfig>(
      'POST',
      '/api/merchant/alliance-config',
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        clusterId: payload.clusterId,
        stores: payload.stores,
        walletShared: payload.walletShared,
        tierShared: payload.tierShared,
      },
    );
  },

  listStores: async (token: string, merchantId = runtimeMerchantId) => {
    return requestJson<{
      merchantId: string;
      clusterId: string;
      walletShared: boolean;
      tierShared: boolean;
      stores: { merchantId: string; name: string }[];
    }>(
      'GET',
      `/api/merchant/stores?merchantId=${encodeURIComponent(merchantId)}`,
      token,
    );
  },

  applyContract: async (
    token: string,
    payload: {
      merchantId?: string;
      companyName: string;
      licenseNo: string;
      settlementAccount: string;
      contactPhone: string;
      notes?: string;
    },
  ) => {
    return requestJson<MerchantContractStatusResult>(
      'POST',
      '/api/merchant/contract/apply',
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        companyName: payload.companyName,
        licenseNo: payload.licenseNo,
        settlementAccount: payload.settlementAccount,
        contactPhone: payload.contactPhone,
        notes: payload.notes || '',
      },
    );
  },

  getContractStatus: async (token: string, merchantId = runtimeMerchantId) => {
    return requestJson<MerchantContractStatusResult>(
      'GET',
      `/api/merchant/contract/status?merchantId=${encodeURIComponent(merchantId)}`,
      token,
    );
  },

  syncAllianceUser: async (
    token: string,
    payload: {
      merchantId?: string;
      userId: string;
    },
  ) => {
    return requestJson<{
      merchantId: string;
      userId: string;
      syncedStores: string[];
    }>(
      'POST',
      '/api/merchant/alliance/sync-user',
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        userId: payload.userId,
      },
    );
  },

  socialTransfer: async (
    token: string,
    payload: {
      merchantId?: string;
      fromUserId: string;
      toUserId: string;
      amount: number;
      idempotencyKey?: string;
    },
  ) => {
    return requestJson<SocialTransferResult>(
      'POST',
      '/api/social/transfer',
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        fromUserId: payload.fromUserId,
        toUserId: payload.toUserId,
        amount: payload.amount,
        idempotencyKey: payload.idempotencyKey,
      },
    );
  },

  createSocialRedPacket: async (
    token: string,
    payload: {
      merchantId?: string;
      senderUserId: string;
      totalAmount: number;
      totalSlots: number;
      expiresInMinutes?: number;
      idempotencyKey?: string;
    },
  ) => {
    return requestJson<SocialRedPacket>(
      'POST',
      '/api/social/red-packets',
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        senderUserId: payload.senderUserId,
        totalAmount: payload.totalAmount,
        totalSlots: payload.totalSlots,
        expiresInMinutes: payload.expiresInMinutes,
        idempotencyKey: payload.idempotencyKey,
      },
    );
  },

  claimSocialRedPacket: async (
    token: string,
    payload: {
      merchantId?: string;
      packetId: string;
      userId: string;
      idempotencyKey?: string;
    },
  ) => {
    return requestJson<SocialRedPacketClaimResult>(
      'POST',
      `/api/social/red-packets/${encodeURIComponent(payload.packetId)}/claim`,
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        userId: payload.userId,
        idempotencyKey: payload.idempotencyKey,
      },
    );
  },

  getSocialRedPacket: async (
    token: string,
    payload: {
      merchantId?: string;
      packetId: string;
    },
  ) => {
    return requestJson<SocialRedPacket>(
      'GET',
      `/api/social/red-packets/${encodeURIComponent(
        payload.packetId,
      )}?merchantId=${encodeURIComponent(payload.merchantId || runtimeMerchantId)}`,
      token,
    );
  },

  createTreatSession: async (
    token: string,
    payload: {
      merchantId?: string;
      initiatorUserId: string;
      mode: 'GROUP_PAY' | 'MERCHANT_SUBSIDY';
      orderAmount: number;
      subsidyRate?: number;
      subsidyCap?: number;
      dailySubsidyCap?: number;
      ttlMinutes?: number;
    },
  ) => {
    return requestJson<TreatSession>(
      'POST',
      '/api/social/treat/sessions',
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        initiatorUserId: payload.initiatorUserId,
        mode: payload.mode,
        orderAmount: payload.orderAmount,
        subsidyRate: payload.subsidyRate,
        subsidyCap: payload.subsidyCap,
        dailySubsidyCap: payload.dailySubsidyCap,
        ttlMinutes: payload.ttlMinutes,
      },
    );
  },

  joinTreatSession: async (
    token: string,
    payload: {
      merchantId?: string;
      sessionId: string;
      userId: string;
      amount: number;
      idempotencyKey?: string;
    },
  ) => {
    return requestJson<{
      sessionId: string;
      merchantId: string;
      userId: string;
      amount: number;
      totalContributed: number;
      userWallet: { principal: number; bonus: number; silver: number };
    }>(
      'POST',
      `/api/social/treat/sessions/${encodeURIComponent(payload.sessionId)}/join`,
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
        userId: payload.userId,
        amount: payload.amount,
        idempotencyKey: payload.idempotencyKey,
      },
    );
  },

  closeTreatSession: async (
    token: string,
    payload: {
      merchantId?: string;
      sessionId: string;
    },
  ) => {
    return requestJson<TreatSession>(
      'POST',
      `/api/social/treat/sessions/${encodeURIComponent(payload.sessionId)}/close`,
      token,
      {
        merchantId: payload.merchantId || runtimeMerchantId,
      },
    );
  },

  getTreatSession: async (
    token: string,
    payload: {
      merchantId?: string;
      sessionId: string;
    },
  ) => {
    return requestJson(
      'GET',
      `/api/social/treat/sessions/${encodeURIComponent(
        payload.sessionId,
      )}?merchantId=${encodeURIComponent(payload.merchantId || runtimeMerchantId)}`,
      token,
    );
  },

  getAuditLogs: async (
    token: string,
    options: {
      merchantId?: string;
      limit?: number;
      cursor?: string | null;
      startTime?: string;
      endTime?: string;
      action?: string;
      status?: string;
    } = {},
  ) => {
    const merchantId = options.merchantId || runtimeMerchantId;
    const limit = options.limit || 6;
    const query = new URLSearchParams();
    query.set('merchantId', merchantId);
    query.set('limit', String(limit));
    if (options.cursor) {
      query.set('cursor', options.cursor);
    }
    if (options.startTime) {
      query.set('startTime', options.startTime);
    }
    if (options.endTime) {
      query.set('endTime', options.endTime);
    }
    if (options.action && options.action !== 'ALL') {
      query.set('action', options.action);
    }
    if (options.status && options.status !== 'ALL') {
      query.set('status', options.status);
    }
    return requestJson<AuditLogPage>(
      'GET',
      `/api/audit/logs?${query.toString()}`,
      token,
    );
  },

  getWsUrl: (token: string, merchantId = runtimeMerchantId) => {
    if (!BASE_URL) {
      return '';
    }
    const wsBase = BASE_URL.replace(/^http/i, 'ws');
    return `${wsBase}/ws?merchantId=${encodeURIComponent(
      merchantId,
    )}&token=${encodeURIComponent(token)}`;
  },
};
