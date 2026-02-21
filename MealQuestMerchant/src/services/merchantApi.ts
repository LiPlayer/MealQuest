import {MerchantState} from '../domain/merchantEngine';

const getEnv = (name: string): string => {
  if (typeof process === 'undefined' || !process.env) {
    return '';
  }
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
};

const BASE_URL = getEnv('MQ_SERVER_BASE_URL');
const USE_REMOTE = getEnv('MQ_USE_REMOTE_API') === 'true' && BASE_URL.length > 0;

type HttpMethod = 'GET' | 'POST';

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
    ...(body ? {body: JSON.stringify(body)} : {}),
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
}): MerchantState {
  return {
    merchantId: payload.dashboard.merchantId,
    merchantName: payload.dashboard.merchantName,
    killSwitchEnabled: Boolean(payload.dashboard.killSwitchEnabled),
    budgetCap: Number(payload.dashboard.budgetCap || 0),
    budgetUsed: Number(payload.dashboard.budgetUsed || 0),
    pendingProposals: (payload.dashboard.pendingProposals || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      status: 'PENDING' as const,
      campaignDraft: {
        id: `${item.id}_draft`,
        name: item.title,
        triggerEvent: 'WEATHER_CHANGE' as const,
        condition: {field: 'weather', equals: 'RAIN'},
        budget: {cap: 0, used: 0, costPerHit: 0},
      },
    })),
    activeCampaigns: (payload.campaigns || []).map((campaign: any) => ({
      id: campaign.id,
      name: campaign.name,
      triggerEvent: campaign.trigger?.event || 'WEATHER_CHANGE',
      condition: {
        field: campaign.conditions?.[0]?.field || 'weather',
        equals: campaign.conditions?.[0]?.value ?? 'RAIN',
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
  isConfigured: () => USE_REMOTE,
  getBaseUrl: () => BASE_URL,

  loginAsMerchant: async () => {
    const response = await fetch(`${BASE_URL}/api/auth/mock-login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({role: 'OWNER', merchantId: 'm_demo'}),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'merchant login failed');
    }
    return data.token as string;
  },

  getState: async (token: string, merchantId = 'm_demo') => {
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
    });
  },

  approveProposal: async (token: string, proposalId: string, merchantId = 'm_demo') => {
    return requestJson(
      'POST',
      `/api/merchant/proposals/${proposalId}/confirm`,
      token,
      {merchantId, operatorId: 'staff_owner'},
    );
  },

  setKillSwitch: async (token: string, enabled: boolean, merchantId = 'm_demo') => {
    return requestJson('POST', '/api/merchant/kill-switch', token, {
      merchantId,
      enabled,
    });
  },

  triggerRainEvent: async (
    token: string,
    merchantId = 'm_demo',
  ): Promise<TriggerRainEventResult> => {
    return requestJson<TriggerRainEventResult>('POST', '/api/tca/trigger', token, {
      merchantId,
      userId: 'u_demo',
      event: 'WEATHER_CHANGE',
      context: {weather: 'RAIN'},
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
    const merchantId = options.merchantId || 'm_demo';
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

  getWsUrl: (token: string, merchantId = 'm_demo') => {
    if (!BASE_URL) {
      return '';
    }
    const wsBase = BASE_URL.replace(/^http/i, 'ws');
    return `${wsBase}/ws?merchantId=${encodeURIComponent(
      merchantId,
    )}&token=${encodeURIComponent(token)}`;
  },
};
