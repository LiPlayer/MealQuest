import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import StatTile from '../components/ui/StatTile';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import {
  FeedbackSummaryResponse,
  NotificationCategory,
  NotificationInboxItem,
  NotificationStatus,
  getFeedbackSummary,
  getNotificationInbox,
  getNotificationUnreadSummary,
  markNotificationsRead,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

const STATUS_FILTERS: NotificationStatus[] = ['ALL', 'UNREAD', 'READ'];
const CATEGORY_FILTERS: NotificationCategory[] = ['ALL', 'APPROVAL_TODO', 'EXECUTION_RESULT', 'FEEDBACK_TICKET'];

function formatStatus(value: string): string {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'UNREAD') {
    return '未读';
  }
  if (normalized === 'READ') {
    return '已读';
  }
  return normalized || '-';
}

function formatCategory(value: string): string {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'APPROVAL_TODO') {
    return '审批待办';
  }
  if (normalized === 'EXECUTION_RESULT') {
    return '执行结果';
  }
  if (normalized === 'GENERAL') {
    return '系统提醒';
  }
  if (normalized === 'FEEDBACK_TICKET') {
    return '反馈进展';
  }
  if (normalized === 'ALL') {
    return '全部';
  }
  return normalized || '-';
}

function formatTime(value: string): string {
  const ts = Date.parse(String(value || ''));
  if (!Number.isFinite(ts)) {
    return value || '暂无';
  }
  return new Date(ts).toLocaleString();
}

export default function NotificationsScreen() {
  const { authSession } = useMerchant();
  const [statusFilter, setStatusFilter] = useState<NotificationStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory>('ALL');
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [approvalUnread, setApprovalUnread] = useState(0);
  const [executionUnread, setExecutionUnread] = useState(0);
  const [feedbackUnread, setFeedbackUnread] = useState(0);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummaryResponse | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actingId, setActingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');

  const merchantId = String(authSession?.merchantId || '').trim();
  const token = String(authSession?.token || '').trim();
  const role = String(authSession?.role || '').trim().toUpperCase();
  const canViewFeedbackSummary = role === 'OWNER' || role === 'MANAGER';

  const summaryByCategory = useMemo(() => {
    return {
      approval: approvalUnread,
      execution: executionUnread,
      feedback: feedbackUnread,
    };
  }, [approvalUnread, executionUnread, feedbackUnread]);

  const loadInbox = useCallback(async () => {
    if (!merchantId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const [summaryResult, inboxResult] = await Promise.all([
        getNotificationUnreadSummary({
          merchantId,
          token,
        }),
        getNotificationInbox({
          merchantId,
          token,
          status: statusFilter,
          category: categoryFilter,
          limit: 20,
        }),
      ]);
      setTotalUnread(Number(summaryResult.totalUnread) || 0);
      const byCategory = Array.isArray(summaryResult.byCategory) ? summaryResult.byCategory : [];
      const approval = byCategory.find((item) => String(item.category || '').toUpperCase() === 'APPROVAL_TODO');
      const execution = byCategory.find((item) => String(item.category || '').toUpperCase() === 'EXECUTION_RESULT');
      const feedback = byCategory.find((item) => String(item.category || '').toUpperCase() === 'FEEDBACK_TICKET');
      setApprovalUnread(Number(approval?.unreadCount) || 0);
      setExecutionUnread(Number(execution?.unreadCount) || 0);
      setFeedbackUnread(Number(feedback?.unreadCount) || 0);
      setItems(Array.isArray(inboxResult.items) ? inboxResult.items : []);
      setNextCursor(inboxResult.pageInfo?.nextCursor || null);
      setHasMore(Boolean(inboxResult.pageInfo?.hasMore));
    } catch (error) {
      const message = error instanceof Error ? error.message : '提醒列表加载失败';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, merchantId, statusFilter, token]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const loadFeedback = useCallback(async () => {
    if (!merchantId || !token) {
      return;
    }
    if (!canViewFeedbackSummary) {
      setFeedbackSummary(null);
      setFeedbackError('');
      setFeedbackLoading(false);
      return;
    }
    setFeedbackLoading(true);
    setFeedbackError('');
    try {
      const result = await getFeedbackSummary({
        merchantId,
        token,
        windowHours: 168,
      });
      setFeedbackSummary(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '反馈汇总加载失败';
      setFeedbackError(message);
      setFeedbackSummary(null);
    } finally {
      setFeedbackLoading(false);
    }
  }, [canViewFeedbackSummary, merchantId, token]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const loadMore = useCallback(async () => {
    if (!merchantId || !token || !hasMore || !nextCursor) {
      return;
    }
    setLoadingMore(true);
    setErrorMessage('');
    try {
      const inboxResult = await getNotificationInbox({
        merchantId,
        token,
        status: statusFilter,
        category: categoryFilter,
        limit: 20,
        cursor: nextCursor,
      });
      const moreItems = Array.isArray(inboxResult.items) ? inboxResult.items : [];
      setItems((prev) => [...prev, ...moreItems]);
      setNextCursor(inboxResult.pageInfo?.nextCursor || null);
      setHasMore(Boolean(inboxResult.pageInfo?.hasMore));
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载更多提醒失败';
      setErrorMessage(message);
    } finally {
      setLoadingMore(false);
    }
  }, [categoryFilter, hasMore, merchantId, nextCursor, statusFilter, token]);

  const handleMarkOneRead = useCallback(
    async (notificationId: string) => {
      if (!merchantId || !token) {
        return;
      }
      setActingId(notificationId);
      setNoticeMessage('');
      setErrorMessage('');
      try {
        await markNotificationsRead({
          merchantId,
          token,
          notificationIds: [notificationId],
          markAll: false,
        });
        await loadInbox();
        setNoticeMessage('已标记为已读。');
      } catch (error) {
        const message = error instanceof Error ? error.message : '标记已读失败';
        setErrorMessage(message);
      } finally {
        setActingId('');
      }
    },
    [loadInbox, merchantId, token],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!merchantId || !token || totalUnread <= 0) {
      return;
    }
    setActingId('mark-all');
    setNoticeMessage('');
    setErrorMessage('');
    try {
      await markNotificationsRead({
        merchantId,
        token,
        markAll: true,
      });
      await loadInbox();
      setNoticeMessage('全部提醒已标记为已读。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '全部已读失败';
      setErrorMessage(message);
    } finally {
      setActingId('');
    }
  }, [loadInbox, merchantId, token, totalUnread]);

  return (
    <AppShell scroll edges={['bottom']}>
      <SurfaceCard>
        <Text style={styles.sectionTitle}>未读摘要</Text>
        <View style={styles.grid}>
          <StatTile label="未读总数" value={totalUnread} />
          <StatTile label="审批待办" value={summaryByCategory.approval} />
          <StatTile label="执行结果" value={summaryByCategory.execution} />
          <StatTile label="反馈进展" value={summaryByCategory.feedback} />
        </View>
        <View style={styles.actionWrap}>
          <ActionButton
            label="刷新提醒"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              void loadInbox();
              void loadFeedback();
            }}
            disabled={loading || loadingMore || Boolean(actingId)}
          />
          <ActionButton
            label={actingId === 'mark-all' ? '处理中...' : '全部已读'}
            icon={actingId === 'mark-all' ? 'hourglass-top' : 'done-all'}
            variant="secondary"
            onPress={() => {
              void handleMarkAllRead();
            }}
            disabled={totalUnread <= 0 || loading || loadingMore || Boolean(actingId)}
            busy={actingId === 'mark-all'}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>反馈汇总（7天）</Text>
        {!canViewFeedbackSummary ? (
          <Text style={styles.metaText}>当前角色仅可查看提醒列表，反馈汇总仅对 OWNER/MANAGER 开放。</Text>
        ) : null}
        {canViewFeedbackSummary && feedbackLoading ? <Text style={styles.metaText}>反馈汇总加载中...</Text> : null}
        {canViewFeedbackSummary && feedbackError ? <Text style={styles.errorText}>{feedbackError}</Text> : null}
        {canViewFeedbackSummary && feedbackSummary ? (
          <>
            <View style={styles.grid}>
              <StatTile label="工单总数" value={feedbackSummary.totals.tickets} />
              <StatTile label="未解决" value={feedbackSummary.totals.unresolvedCount} />
              <StatTile label="已解决" value={feedbackSummary.totals.resolvedCount} />
            </View>
            <View style={styles.feedbackStatusWrap}>
              {feedbackSummary.byStatus.map((item) => (
                <Text key={item.status} style={styles.metaText}>
                  {item.status}：{item.count}
                </Text>
              ))}
            </View>
            {feedbackSummary.latestTickets.slice(0, 3).map((item) => (
              <View key={item.ticketId} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{item.title || '顾客反馈'}</Text>
                <Text style={styles.metaText}>状态：{item.status}</Text>
                <Text style={styles.metaText}>
                  更新时间：{formatTime(item.updatedAt || item.createdAt)}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>筛选条件</Text>
        <Text style={styles.filterLabel}>状态</Text>
        <View style={styles.chipWrap}>
          {STATUS_FILTERS.map((item) => {
            const active = item === statusFilter;
            return (
              <Pressable
                key={item}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => setStatusFilter(item)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                  {item === 'ALL' ? '全部' : item === 'UNREAD' ? '未读' : '已读'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.filterLabel}>类别</Text>
        <View style={styles.chipWrap}>
          {CATEGORY_FILTERS.map((item) => {
            const active = item === categoryFilter;
            return (
              <Pressable
                key={item}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => setCategoryFilter(item)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                  {formatCategory(item)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>提醒列表</Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {noticeMessage ? <Text style={styles.noticeText}>{noticeMessage}</Text> : null}
        {loading ? <Text style={styles.metaText}>加载中...</Text> : null}
        {!loading && items.length === 0 ? <Text style={styles.metaText}>当前筛选下暂无提醒。</Text> : null}

        {!loading
          ? items.map((item) => {
              const unread = String(item.status || '').toUpperCase() === 'UNREAD';
              const busy = actingId === item.notificationId;
              return (
                <View key={item.notificationId} style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle}>{item.title || formatCategory(item.category)}</Text>
                    <Text style={styles.rowStatus}>{formatStatus(item.status)}</Text>
                  </View>
                  <Text style={styles.rowBody}>{item.body || '-'}</Text>
                  <Text style={styles.metaText}>类别：{formatCategory(item.category)}</Text>
                  <Text style={styles.metaText}>时间：{formatTime(item.createdAt)}</Text>
                  <Text style={styles.metaText}>ID：{item.notificationId}</Text>
                  {unread ? (
                    <ActionButton
                      label={busy ? '处理中...' : '标记已读'}
                      icon={busy ? 'hourglass-top' : 'done'}
                      variant="secondary"
                      onPress={() => {
                        void handleMarkOneRead(item.notificationId);
                      }}
                      disabled={busy || Boolean(actingId && !busy)}
                      busy={busy}
                    />
                  ) : null}
                </View>
              );
            })
          : null}

        {hasMore ? (
          <ActionButton
            label={loadingMore ? '加载中...' : '加载更多'}
            icon={loadingMore ? 'hourglass-top' : 'expand-more'}
            variant="secondary"
            onPress={() => {
              void loadMore();
            }}
            disabled={loading || loadingMore || Boolean(actingId)}
            busy={loadingMore}
          />
        ) : null}
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
  },
  grid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  actionWrap: {
    gap: mqTheme.spacing.sm,
  },
  filterLabel: {
    ...mqTheme.typography.caption,
    color: '#4e617d',
  },
  chipWrap: {
    flexDirection: 'row',
    gap: mqTheme.spacing.xs,
    flexWrap: 'wrap',
  },
  feedbackStatusWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d0dbed',
    borderRadius: mqTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f4f7fc',
  },
  chipActive: {
    borderColor: '#9bb8ec',
    backgroundColor: '#e8f0ff',
  },
  chipText: {
    fontSize: 12,
    color: '#4e617d',
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#244f90',
  },
  rowCard: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#ffffff',
    padding: mqTheme.spacing.sm,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#1f314d',
    flex: 1,
  },
  rowStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: '#244f90',
  },
  rowBody: {
    ...mqTheme.typography.body,
    color: '#2e425e',
  },
  metaText: {
    ...mqTheme.typography.caption,
    color: '#5b6f8f',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: mqTheme.colors.danger,
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#20624b',
  },
});
