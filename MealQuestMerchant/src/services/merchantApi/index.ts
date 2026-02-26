import { toMerchantState } from './mappers';
import { requestJson, requestPublicJson } from './http';
import { getBaseUrl, getMerchantId, isConfigured, setMerchantId } from './runtime';
import {
  AllianceConfig,
  AuditLogPage,
  CampaignStatusResult,
  FireSaleResult,
  MerchantCatalogResult,
  MerchantContractStatusResult,
  MerchantOnboardResult,
  MerchantPhoneCodeResult,
  MerchantPhoneLoginResult,
  StrategyChatMessagePage,
  StrategyChatReviewResult,
  StrategyChatSessionResult,
  StrategyChatTurnResult,
  TriggerRainEventResult,
} from './types';

export const MerchantApi = {
  isConfigured,
  getBaseUrl,
  getMerchantId,
  setMerchantId,

  getMerchantCatalog: async () => {
    return requestPublicJson<MerchantCatalogResult>('GET', '/api/merchant/catalog');
  },

  onboardMerchant: async (payload: {
    merchantId: string;
    name: string;
    budgetCap?: number;
    ownerPhone?: string;
  }) => {
    const result = await requestPublicJson<MerchantOnboardResult>('POST', '/api/merchant/onboard', payload);
    setMerchantId(result.merchant.merchantId);
    return result;
  },

  loginByPhone: async (payload: {
    phone: string;
    code: string;
  }) => {
    return requestPublicJson<MerchantPhoneLoginResult>('POST', '/api/auth/merchant/phone-login', payload);
  },

  requestMerchantLoginCode: async (phone: string) => {
    return requestPublicJson<MerchantPhoneCodeResult>('POST', '/api/auth/merchant/request-code', { phone });
  },

  getState: async (token: string, merchantId = getMerchantId()) => {
    const state = await requestJson<any>(
      'GET',
      `/api/state?merchantId=${encodeURIComponent(merchantId)}`,
      token,
    );
    return toMerchantState({
      dashboard: state.dashboard,
      campaigns: state.campaigns,
      proposals: state.proposals,
    });
  },

  setKillSwitch: async (token: string, enabled: boolean, merchantId = getMerchantId()) => {
    return requestJson('POST', '/api/merchant/kill-switch', token, {
      merchantId,
      enabled,
    });
  },

  triggerRainEvent: async (
    token: string,
    userId: string,
    merchantId = getMerchantId(),
  ): Promise<TriggerRainEventResult> => {
    return MerchantApi.triggerEvent(token, 'WEATHER_CHANGE', { weather: 'RAIN' }, userId, merchantId);
  },

  triggerEvent: async (
    token: string,
    event: string,
    context: Record<string, string | boolean | number>,
    userId: string,
    merchantId = getMerchantId(),
  ): Promise<TriggerRainEventResult> => {
    return requestJson<TriggerRainEventResult>('POST', '/api/tca/trigger', token, {
      merchantId,
      userId,
      event,
      context,
    });
  },

  getStrategyChatSession: async (
    token: string,
    options: {
      merchantId?: string;
    } = {},
  ) => {
    const merchantId = options.merchantId || getMerchantId();
    const query = new URLSearchParams();
    query.set('merchantId', merchantId);
    return requestJson<StrategyChatSessionResult>(
      'GET',
      `/api/merchant/strategy-chat/session?${query.toString()}`,
      token,
    );
  },

  getStrategyChatMessages: async (
    token: string,
    options: {
      merchantId?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) => {
    const merchantId = options.merchantId || getMerchantId();
    const query = new URLSearchParams();
    query.set('merchantId', merchantId);
    if (options.cursor) {
      query.set('cursor', options.cursor);
    }
    if (Number.isFinite(Number(options.limit)) && Number(options.limit) > 0) {
      query.set('limit', String(Math.floor(Number(options.limit))));
    }
    return requestJson<StrategyChatMessagePage>(
      'GET',
      `/api/merchant/strategy-chat/messages?${query.toString()}`,
      token,
    );
  },

  createStrategyChatSession: async (
    token: string,
    options: {
      merchantId?: string;
    } = {},
  ) => {
    return requestJson<StrategyChatSessionResult>('POST', '/api/merchant/strategy-chat/sessions', token, {
      merchantId: options.merchantId || getMerchantId(),
    });
  },

  sendStrategyChatMessage: async (
    token: string,
    payload: {
      merchantId?: string;
      content: string;
    },
  ) => {
    return requestJson<StrategyChatTurnResult>('POST', '/api/merchant/strategy-chat/messages', token, {
      merchantId: payload.merchantId || getMerchantId(),
      content: payload.content,
    });
  },

  reviewStrategyChatProposal: async (
    token: string,
    payload: {
      proposalId: string;
      decision: 'APPROVE' | 'REJECT';
      merchantId?: string;
    },
  ) => {
    return requestJson<StrategyChatReviewResult>(
      'POST',
      `/api/merchant/strategy-chat/proposals/${encodeURIComponent(payload.proposalId)}/review`,
      token,
      {
        merchantId: payload.merchantId || getMerchantId(),
        decision: payload.decision,
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
        merchantId: payload.merchantId || getMerchantId(),
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
      merchantId: payload.merchantId || getMerchantId(),
      targetSku: payload.targetSku,
      ttlMinutes: payload.ttlMinutes,
      voucherValue: payload.voucherValue,
      maxQty: payload.maxQty,
    });
  },

  getAllianceConfig: async (token: string, merchantId = getMerchantId()) => {
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
    return requestJson<AllianceConfig>('POST', '/api/merchant/alliance-config', token, {
      merchantId: payload.merchantId || getMerchantId(),
      clusterId: payload.clusterId,
      stores: payload.stores,
      walletShared: payload.walletShared,
      tierShared: payload.tierShared,
    });
  },

  listStores: async (token: string, merchantId = getMerchantId()) => {
    return requestJson<{
      merchantId: string;
      clusterId: string;
      walletShared: boolean;
      tierShared: boolean;
      stores: { merchantId: string; name: string }[];
    }>('GET', `/api/merchant/stores?merchantId=${encodeURIComponent(merchantId)}`, token);
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
    return requestJson<MerchantContractStatusResult>('POST', '/api/merchant/contract/apply', token, {
      merchantId: payload.merchantId || getMerchantId(),
      companyName: payload.companyName,
      licenseNo: payload.licenseNo,
      settlementAccount: payload.settlementAccount,
      contactPhone: payload.contactPhone,
      notes: payload.notes || '',
    });
  },

  getContractStatus: async (token: string, merchantId = getMerchantId()) => {
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
    }>('POST', '/api/merchant/alliance/sync-user', token, {
      merchantId: payload.merchantId || getMerchantId(),
      userId: payload.userId,
    });
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
    const merchantId = options.merchantId || getMerchantId();
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
    return requestJson<AuditLogPage>('GET', `/api/audit/logs?${query.toString()}`, token);
  },

  getWsUrl: (token: string, merchantId = getMerchantId()) => {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return '';
    }
    const wsBase = baseUrl.replace(/^http/i, 'ws');
    return `${wsBase}/ws?merchantId=${encodeURIComponent(merchantId)}&token=${encodeURIComponent(token)}`;
  },
};
