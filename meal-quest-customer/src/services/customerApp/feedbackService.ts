import { apiRequestJson } from '@/adapters/api/client';
import {
  FeedbackTicket,
  FeedbackTicketCategory,
  FeedbackTicketListResult,
  FeedbackTicketStatus,
  FeedbackTicketTimelineEvent,
} from '@/services/dataTypes';

import { ensureCustomerSession } from './sessionService';

type TicketListResponse = {
  status?: unknown;
  category?: unknown;
  items?: unknown[];
  pageInfo?: {
    hasMore?: unknown;
    nextCursor?: unknown;
  };
};

type TicketDetailResponse = {
  ticket?: unknown;
};

type CreateTicketResponse = {
  ticket?: unknown;
};

function toString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toFeedbackStatus(value: unknown, fallback: FeedbackTicketStatus = 'OPEN'): FeedbackTicketStatus {
  const normalized = toString(value).toUpperCase();
  if (normalized === 'OPEN' || normalized === 'IN_PROGRESS' || normalized === 'RESOLVED' || normalized === 'CLOSED') {
    return normalized;
  }
  return fallback;
}

function toFeedbackCategory(
  value: unknown,
  fallback: FeedbackTicketCategory = 'OTHER',
): FeedbackTicketCategory {
  const normalized = toString(value).toUpperCase();
  if (
    normalized === 'PAYMENT' ||
    normalized === 'BENEFIT' ||
    normalized === 'PRIVACY' ||
    normalized === 'ACCOUNT' ||
    normalized === 'OTHER'
  ) {
    return normalized;
  }
  return fallback;
}

function toFeedbackTimelineEvent(raw: unknown): FeedbackTicketTimelineEvent {
  const row = (raw || {}) as Record<string, unknown>;
  return {
    eventId: toString(row.eventId),
    fromStatus: row.fromStatus ? toFeedbackStatus(row.fromStatus) : null,
    toStatus: toFeedbackStatus(row.toStatus),
    note: toString(row.note),
    actorRole: toString(row.actorRole),
    actorId: toString(row.actorId),
    createdAt: toString(row.createdAt, new Date().toISOString()),
  };
}

function toFeedbackTicket(raw: unknown): FeedbackTicket {
  const row = (raw || {}) as Record<string, unknown>;
  const timeline = Array.isArray(row.timeline)
    ? row.timeline.map((item) => toFeedbackTimelineEvent(item))
    : undefined;
  const latestEvent = row.latestEvent ? toFeedbackTimelineEvent(row.latestEvent) : null;

  return {
    ticketId: toString(row.ticketId),
    merchantId: toString(row.merchantId),
    userId: toString(row.userId),
    category: toFeedbackCategory(row.category),
    title: toString(row.title, '问题反馈'),
    description: toString(row.description),
    contact: toString(row.contact),
    status: toFeedbackStatus(row.status),
    createdAt: toString(row.createdAt, new Date().toISOString()),
    updatedAt: toString(row.updatedAt, new Date().toISOString()),
    latestEvent,
    timeline,
  };
}

export async function createFeedbackTicket(params: {
  merchantId: string;
  category: FeedbackTicketCategory;
  title: string;
  description: string;
  contact?: string;
}): Promise<FeedbackTicket> {
  const merchantId = toString(params.merchantId);
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const title = toString(params.title);
  if (!title) {
    throw new Error('title is required');
  }
  const description = toString(params.description);
  if (!description) {
    throw new Error('description is required');
  }

  const session = await ensureCustomerSession(merchantId);
  const response = await apiRequestJson<CreateTicketResponse>({
    method: 'POST',
    path: '/api/feedback/tickets',
    token: session.token,
    data: {
      merchantId,
      category: toFeedbackCategory(params.category),
      title,
      description,
      contact: toString(params.contact),
    },
  });
  return toFeedbackTicket(response.ticket);
}

export async function getFeedbackTickets(params: {
  merchantId: string;
  status?: 'ALL' | FeedbackTicketStatus;
  category?: 'ALL' | FeedbackTicketCategory;
  limit?: number;
  cursor?: string;
}): Promise<FeedbackTicketListResult> {
  const merchantId = toString(params.merchantId);
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  const session = await ensureCustomerSession(merchantId);
  const statusRaw = toString(params.status, 'ALL').toUpperCase();
  const categoryRaw = toString(params.category, 'ALL').toUpperCase();
  const status = statusRaw === 'ALL' ? 'ALL' : toFeedbackStatus(statusRaw);
  const category = categoryRaw === 'ALL' ? 'ALL' : toFeedbackCategory(categoryRaw);
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

  const response = await apiRequestJson<TicketListResponse>({
    method: 'GET',
    path: `/api/feedback/tickets?${query}`,
    token: session.token,
  });
  const items = Array.isArray(response.items) ? response.items.map((item) => toFeedbackTicket(item)) : [];
  return {
    items,
    hasMore: Boolean(response.pageInfo?.hasMore),
    nextCursor: toString(response.pageInfo?.nextCursor) || null,
    status,
    category,
  };
}

export async function getFeedbackTicketDetail(params: {
  merchantId: string;
  ticketId: string;
}): Promise<FeedbackTicket> {
  const merchantId = toString(params.merchantId);
  const ticketId = toString(params.ticketId);
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  if (!ticketId) {
    throw new Error('ticketId is required');
  }
  const session = await ensureCustomerSession(merchantId);
  const response = await apiRequestJson<TicketDetailResponse>({
    method: 'GET',
    path:
      `/api/feedback/tickets/${encodeURIComponent(ticketId)}` +
      `?merchantId=${encodeURIComponent(merchantId)}`,
    token: session.token,
  });
  return toFeedbackTicket(response.ticket);
}
