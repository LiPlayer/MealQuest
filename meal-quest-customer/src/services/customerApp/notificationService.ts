import { apiRequestJson } from '@/adapters/api/client';
import { CustomerNotificationItem, CustomerNotificationSummary } from '@/services/dataTypes';

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

function toString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

export async function getNotificationInbox(params: {
  merchantId: string;
  status?: 'ALL' | 'UNREAD' | 'READ';
  category?: 'ALL' | 'APPROVAL_TODO' | 'EXECUTION_RESULT' | 'GENERAL';
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
