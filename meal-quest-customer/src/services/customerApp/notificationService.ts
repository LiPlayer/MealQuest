import { apiRequestJson } from '@/adapters/api/client';
import {
  CustomerNotificationItem,
  CustomerNotificationPreference,
  CustomerNotificationPreferenceCategory,
  CustomerNotificationPreferenceFrequencyCap,
  CustomerNotificationSummary,
} from '@/services/dataTypes';

import { ensureCustomerSession } from './sessionService';

type InboxResponse = {
  items?: unknown[];
  pageInfo?: {
    nextCursor?: string | null;
    hasMore?: boolean;
  };
};

type SummaryResponse = {
  totalUnread?: number;
  byCategory?: unknown[];
};

type PreferenceResponse = {
  version?: unknown;
  merchantId?: unknown;
  recipientType?: unknown;
  recipientId?: unknown;
  categories?: unknown;
  frequencyCaps?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
};

const PREFERENCE_CATEGORIES: CustomerNotificationPreferenceCategory[] = [
  'APPROVAL_TODO',
  'EXECUTION_RESULT',
  'FEEDBACK_TICKET',
  'GENERAL',
];

function toString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (value === true || value === false) {
    return value;
  }
  const normalized = toString(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toRelated(raw: unknown): CustomerNotificationItem['related'] {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  const outcomeRaw = toString(row.outcome).toUpperCase();
  const outcome = ['HIT', 'BLOCKED', 'NO_POLICY', 'INFO'].includes(outcomeRaw)
    ? (outcomeRaw as NonNullable<CustomerNotificationItem['related']>['outcome'])
    : undefined;
  const reasonCodes = Array.isArray(row.reasonCodes)
    ? row.reasonCodes.map((item) => toString(item)).filter(Boolean)
    : [];
  const related: NonNullable<CustomerNotificationItem['related']> = {
    decisionId: toString(row.decisionId) || undefined,
    event: toString(row.event) || undefined,
    outcome,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : undefined,
  };
  if (!related.decisionId && !related.event && !related.outcome && !related.reasonCodes) {
    return undefined;
  }
  return related;
}

function toNotificationItem(raw: Record<string, unknown>): CustomerNotificationItem {
  const status = toString(raw.status, 'UNREAD').toUpperCase() === 'READ' ? 'READ' : 'UNREAD';
  return {
    notificationId: toString(raw.notificationId),
    merchantId: toString(raw.merchantId),
    recipientType: toString(raw.recipientType, 'CUSTOMER_USER') as CustomerNotificationItem['recipientType'],
    recipientId: toString(raw.recipientId),
    category: toString(raw.category, 'GENERAL'),
    title: toString(raw.title, '系统提醒'),
    body: toString(raw.body, ''),
    status,
    createdAt: toString(raw.createdAt, new Date().toISOString()),
    readAt: toString(raw.readAt) || null,
    related: toRelated(raw.related),
  };
}

function toSummary(response: SummaryResponse): CustomerNotificationSummary {
  const byCategoryRaw = Array.isArray(response.byCategory) ? response.byCategory : [];
  return {
    totalUnread: toNumber(response.totalUnread, 0),
    byCategory: byCategoryRaw.map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        category: toString(row.category, 'GENERAL'),
        unreadCount: toNumber(row.unreadCount, 0),
      };
    }),
  };
}

function toPreferenceCategories(raw: unknown): CustomerNotificationPreference['categories'] {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const next: Record<CustomerNotificationPreferenceCategory, boolean> = {
    APPROVAL_TODO: true,
    EXECUTION_RESULT: true,
    FEEDBACK_TICKET: true,
    GENERAL: true,
  };
  for (const category of PREFERENCE_CATEGORIES) {
    if (Object.prototype.hasOwnProperty.call(row, category)) {
      next[category] = toBoolean(row[category], next[category]);
    }
  }
  return next;
}

function toFrequencyCaps(
  raw: unknown,
): CustomerNotificationPreference['frequencyCaps'] {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const next: CustomerNotificationPreference['frequencyCaps'] = {};
  for (const category of PREFERENCE_CATEGORIES) {
    const capRaw = row[category];
    if (!capRaw || typeof capRaw !== 'object') {
      continue;
    }
    const capRow = capRaw as Record<string, unknown>;
    const windowSec = Math.max(0, Math.floor(toNumber(capRow.windowSec, 0)));
    const maxDeliveries = Math.max(0, Math.floor(toNumber(capRow.maxDeliveries, 0)));
    if (windowSec > 0 && maxDeliveries > 0) {
      next[category] = {
        windowSec,
        maxDeliveries,
      };
    }
  }
  return next;
}

function toPreference(response: PreferenceResponse): CustomerNotificationPreference {
  return {
    version: toString(response.version, 'S100-SRV-01.v1'),
    merchantId: toString(response.merchantId),
    recipientType:
      toString(response.recipientType, 'CUSTOMER_USER').toUpperCase() === 'MERCHANT_STAFF'
        ? 'MERCHANT_STAFF'
        : 'CUSTOMER_USER',
    recipientId: toString(response.recipientId),
    categories: toPreferenceCategories(response.categories),
    frequencyCaps: toFrequencyCaps(response.frequencyCaps),
    updatedAt: toString(response.updatedAt) || null,
    updatedBy: toString(response.updatedBy) || null,
  };
}

export async function getNotificationInbox(params: {
  merchantId: string;
  status?: 'ALL' | 'UNREAD' | 'READ';
  category?: 'ALL' | 'APPROVAL_TODO' | 'EXECUTION_RESULT' | 'FEEDBACK_TICKET' | 'GENERAL';
  limit?: number;
  cursor?: string;
}): Promise<{ items: CustomerNotificationItem[]; hasMore: boolean; nextCursor: string | null }> {
  const merchantId = toString(params.merchantId);
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const session = await ensureCustomerSession(merchantId);
  const status = toString(params.status, 'ALL').toUpperCase();
  const category = toString(params.category, 'ALL').toUpperCase();
  const limit = Math.min(Math.max(Math.floor(toNumber(params.limit, 20)), 1), 100);
  const cursor = toString(params.cursor);
  const query = [
    `merchantId=${encodeURIComponent(merchantId)}`,
    `status=${encodeURIComponent(status)}`,
    `category=${encodeURIComponent(category)}`,
    `limit=${encodeURIComponent(String(limit))}`,
    cursor ? `cursor=${encodeURIComponent(cursor)}` : '',
  ]
    .filter(Boolean)
    .join('&');

  const response = await apiRequestJson<InboxResponse>({
    method: 'GET',
    path: `/api/notifications/inbox?${query}`,
    token: session.token,
  });
  const rows = Array.isArray(response.items) ? response.items : [];
  const items = rows.map((item) => toNotificationItem((item || {}) as Record<string, unknown>));
  return {
    items,
    hasMore: Boolean(response.pageInfo?.hasMore),
    nextCursor: toString(response.pageInfo?.nextCursor) || null,
  };
}

export async function getNotificationUnreadSummary(merchantId: string): Promise<CustomerNotificationSummary> {
  const safeMerchantId = toString(merchantId);
  if (!safeMerchantId) {
    throw new Error('merchantId is required');
  }
  const session = await ensureCustomerSession(safeMerchantId);
  const response = await apiRequestJson<SummaryResponse>({
    method: 'GET',
    path: `/api/notifications/unread-summary?merchantId=${encodeURIComponent(safeMerchantId)}`,
    token: session.token,
  });
  return toSummary(response);
}

export async function markNotificationsRead(params: {
  merchantId: string;
  markAll?: boolean;
  notificationIds?: string[];
}): Promise<{ updatedCount: number }> {
  const merchantId = toString(params.merchantId);
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const session = await ensureCustomerSession(merchantId);
  const markAll = Boolean(params.markAll);
  const notificationIds = Array.isArray(params.notificationIds)
    ? params.notificationIds.map((item) => toString(item)).filter(Boolean)
    : [];
  if (!markAll && notificationIds.length === 0) {
    throw new Error('notificationIds is required when markAll is false');
  }
  const response = await apiRequestJson<{ updatedCount?: unknown }>({
    method: 'POST',
    path: '/api/notifications/read',
    token: session.token,
    data: {
      merchantId,
      markAll,
      notificationIds,
    },
  });
  return {
    updatedCount: toNumber(response.updatedCount, 0),
  };
}

export async function getNotificationPreferences(params: {
  merchantId: string;
}): Promise<CustomerNotificationPreference> {
  const merchantId = toString(params.merchantId);
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const session = await ensureCustomerSession(merchantId);
  const response = await apiRequestJson<PreferenceResponse>({
    method: 'GET',
    path: `/api/notifications/preferences?merchantId=${encodeURIComponent(merchantId)}`,
    token: session.token,
  });
  return toPreference(response);
}

export async function setNotificationPreferences(params: {
  merchantId: string;
  categories?: Partial<Record<CustomerNotificationPreferenceCategory, boolean>>;
  frequencyCaps?: Partial<
    Record<CustomerNotificationPreferenceCategory, CustomerNotificationPreferenceFrequencyCap>
  >;
}): Promise<CustomerNotificationPreference> {
  const merchantId = toString(params.merchantId);
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const hasCategoriesPatch = Boolean(params.categories && typeof params.categories === 'object');
  const hasFrequencyPatch = Boolean(params.frequencyCaps && typeof params.frequencyCaps === 'object');
  if (!hasCategoriesPatch && !hasFrequencyPatch) {
    throw new Error('notification preference patch is empty');
  }
  const session = await ensureCustomerSession(merchantId);
  const response = await apiRequestJson<PreferenceResponse>({
    method: 'PUT',
    path: '/api/notifications/preferences',
    token: session.token,
    data: {
      merchantId,
      ...(hasCategoriesPatch ? { categories: params.categories } : {}),
      ...(hasFrequencyPatch ? { frequencyCaps: params.frequencyCaps } : {}),
    },
  });
  return toPreference(response);
}
