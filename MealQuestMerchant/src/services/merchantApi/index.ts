import { toMerchantState } from './mappers';
import { requestJson, requestPublicJson } from './http';
import { getBaseUrl, getMerchantId, isConfigured, setMerchantId } from './runtime';
import {
  AllianceConfig,
  AuditLogPage,
  MerchantCatalogResult,
  MerchantContractStatusResult,
  MerchantOnboardResult,
  MerchantPhoneCodeResult,
  MerchantPhoneLoginResult,
  PolicyDecisionResult,
  StrategyChatPublishResult,
  StrategyChatSimulationResult,
  StrategyChatMessagePage,
  StrategyChatReviewResult,
  StrategyChatSessionResult,
  StrategyChatTurnResult,
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

  createStrategyChatSession: async (
    token: string,
    payload: { merchantId?: string } = {},
  ) => {
    return requestJson<StrategyChatSessionResult>(
      'POST',
      '/api/merchant/strategy-chat/sessions',
      token,
      {
        merchantId: payload.merchantId || getMerchantId(),
      },
    );
  },

  sendStrategyChatMessage: async (
    token: string,
    payload: {
      content: string;
      sessionId?: string;
      merchantId?: string;
    },
  ) => {
    return requestJson<StrategyChatTurnResult>(
      'POST',
      '/api/merchant/strategy-chat/messages',
      token,
      {
        merchantId: payload.merchantId || getMerchantId(),
        sessionId: payload.sessionId,
        content: payload.content,
      },
    );
  },

  getStrategyChatSession: async (
    token: string,
    payload: {
      sessionId?: string;
      deltaFrom?: number;
      merchantId?: string;
    } = {},
  ) => {
    const query = new URLSearchParams();
    query.set('merchantId', payload.merchantId || getMerchantId());
    if (payload.sessionId) {
      query.set('sessionId', payload.sessionId);
    }
    if (Number.isFinite(Number(payload.deltaFrom))) {
      query.set('deltaFrom', String(Math.max(0, Math.floor(Number(payload.deltaFrom)))));
    }
    return requestJson<StrategyChatSessionResult>(
      'GET',
      `/api/merchant/strategy-chat/session?${query.toString()}`,
      token,
    );
  },

  listStrategyChatMessages: async (
    token: string,
    payload: {
      sessionId: string;
      limit?: number;
      cursor?: string | null;
      merchantId?: string;
    },
  ) => {
    const query = new URLSearchParams();
    query.set('merchantId', payload.merchantId || getMerchantId());
    query.set('sessionId', payload.sessionId);
    query.set('limit', String(payload.limit || 20));
    if (payload.cursor) {
      query.set('cursor', payload.cursor);
    }
    return requestJson<StrategyChatMessagePage>(
      'GET',
      `/api/merchant/strategy-chat/messages?${query.toString()}`,
      token,
    );
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

  simulateStrategyChatProposal: async (
    token: string,
    payload: {
      proposalId: string;
      event?: string;
      eventId?: string;
      userId?: string;
      context?: Record<string, unknown>;
      merchantId?: string;
    },
  ) => {
    return requestJson<StrategyChatSimulationResult>(
      'POST',
      `/api/merchant/strategy-chat/proposals/${encodeURIComponent(payload.proposalId)}/simulate`,
      token,
      {
        merchantId: payload.merchantId || getMerchantId(),
        event: payload.event,
        eventId: payload.eventId,
        userId: payload.userId,
        context: payload.context || {},
      },
    );
  },

  publishStrategyChatProposal: async (
    token: string,
    payload: {
      proposalId: string;
      merchantId?: string;
    },
  ) => {
    return requestJson<StrategyChatPublishResult>(
      'POST',
      `/api/merchant/strategy-chat/proposals/${encodeURIComponent(payload.proposalId)}/publish`,
      token,
      {
        merchantId: payload.merchantId || getMerchantId(),
      },
    );
  },

  executePolicyDecision: async (
    token: string,
    payload: {
      event: string;
      eventId?: string;
      userId?: string;
      context?: Record<string, unknown>;
      merchantId?: string;
    },
  ) => {
    return requestJson<PolicyDecisionResult>(
      'POST',
      '/api/policyos/decision/execute',
      token,
      {
        merchantId: payload.merchantId || getMerchantId(),
        event: payload.event,
        eventId: payload.eventId,
        userId: payload.userId,
        context: payload.context || {},
      },
    );
  },

  simulatePolicyDecision: async (
    token: string,
    payload: {
      event: string;
      eventId?: string;
      userId?: string;
      draftId?: string;
      context?: Record<string, unknown>;
      merchantId?: string;
    },
  ) => {
    return requestJson<PolicyDecisionResult>(
      'POST',
      '/api/policyos/decision/simulate',
      token,
      {
        merchantId: payload.merchantId || getMerchantId(),
        event: payload.event,
        eventId: payload.eventId,
        userId: payload.userId,
        draftId: payload.draftId,
        context: payload.context || {},
      },
    );
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
