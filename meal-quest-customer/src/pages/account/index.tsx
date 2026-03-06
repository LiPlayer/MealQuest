import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, Text, Textarea, View } from '@tarojs/components';
import Taro from '@tarojs/taro';

import { DataService } from '@/services/DataService';
import {
  CustomerNotificationItem,
  CustomerNotificationPreference,
  CustomerNotificationSummary,
  CustomerStabilitySnapshot,
  FeedbackTicket,
  FeedbackTicketCategory,
  HomeSnapshot,
  InvoiceItem,
  PaymentLedgerItem,
} from '@/services/dataTypes';
import {
  buildExecutionConsistencyRecords,
  hasTouchpointConsistencyConflict,
} from '@/services/customerApp/executionConsistency';
import { storage } from '@/utils/storage';

import './index.scss';

const DEFAULT_STORE_ID =
  (typeof process !== 'undefined' && process.env && process.env.TARO_APP_DEFAULT_STORE_ID) || '';
const LIFECYCLE_STAGE_ORDER = ['获客', '激活', '活跃', '扩收', '留存'];
const EXECUTION_RESULT_STANDARD_CAP = {
  windowSec: 24 * 60 * 60,
  maxDeliveries: 3,
};
const EXECUTION_RESULT_LOW_DISTURBANCE_CAP = {
  windowSec: 24 * 60 * 60,
  maxDeliveries: 1,
};
type NotificationFrequencyPreset = 'STANDARD' | 'LOW_DISTURBANCE';
const FEEDBACK_CATEGORY_OPTIONS: { value: FeedbackTicketCategory; label: string }[] = [
  { value: 'PAYMENT', label: '支付问题' },
  { value: 'BENEFIT', label: '权益问题' },
  { value: 'PRIVACY', label: '隐私问题' },
  { value: 'ACCOUNT', label: '账号问题' },
  { value: 'OTHER', label: '其他问题' },
];

const toMoney = (value: number) => `¥${Number(value || 0).toFixed(2)}`;

const EMPTY_NOTIFICATION_SUMMARY: CustomerNotificationSummary = {
  totalUnread: 0,
  byCategory: [],
};

function resolveNotificationCategoryLabel(category: string): string {
  const normalized = String(category || '').trim().toUpperCase();
  if (normalized === 'APPROVAL_TODO') {
    return '审批待办';
  }
  if (normalized === 'EXECUTION_RESULT') {
    return '执行结果';
  }
  if (normalized === 'FEEDBACK_TICKET') {
    return '反馈进展';
  }
  if (normalized === 'GENERAL') {
    return '系统提醒';
  }
  return normalized || '提醒';
}

function resolveNotificationFrequencyPresetLabel(preset: NotificationFrequencyPreset): string {
  if (preset === 'LOW_DISTURBANCE') {
    return '低打扰（24小时最多1条）';
  }
  return '标准（24小时最多3条）';
}

function resolveNotificationFrequencyPresetByCap(
  preference: CustomerNotificationPreference | null,
): NotificationFrequencyPreset {
  const maxDeliveries = Number(preference?.frequencyCaps?.EXECUTION_RESULT?.maxDeliveries || 0);
  if (maxDeliveries > 0 && maxDeliveries <= 1) {
    return 'LOW_DISTURBANCE';
  }
  return 'STANDARD';
}

function resolveFeedbackCategoryLabel(category: FeedbackTicket['category']): string {
  const normalized = String(category || '').toUpperCase();
  const matched = FEEDBACK_CATEGORY_OPTIONS.find((item) => item.value === normalized);
  return matched?.label || '其他问题';
}

function resolveFeedbackStatusLabel(status: FeedbackTicket['status']): string {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'OPEN') {
    return '待处理';
  }
  if (normalized === 'IN_PROGRESS') {
    return '处理中';
  }
  if (normalized === 'RESOLVED') {
    return '已解决';
  }
  if (normalized === 'CLOSED') {
    return '已关闭';
  }
  return normalized || '处理中';
}

function resolveStabilityDriverStatusLabel(status: string): string {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PASS') {
    return '通过';
  }
  if (normalized === 'FAIL') {
    return '波动';
  }
  if (normalized === 'REVIEW') {
    return '观察中';
  }
  return normalized || '观察中';
}

function toInputValue(event: unknown): string {
  const record = (event || {}) as {
    detail?: { value?: unknown };
    target?: { value?: unknown };
    currentTarget?: { value?: unknown };
  };
  return String(record.detail?.value ?? record.target?.value ?? record.currentTarget?.value ?? '');
}

function resolveCancelAccountErrorMessage(error: unknown): string {
  const message = String((error as { message?: string })?.message || '')
    .trim()
    .toLowerCase();
  if (!message) {
    return '注销失败，请稍后重试';
  }
  if (message.includes('not found')) {
    return '账号不存在或已注销，请刷新后重试';
  }
  if (message.includes('limit') || message.includes('rate')) {
    return '操作过于频繁，请稍后重试';
  }
  if (message.includes('denied') || message.includes('forbidden')) {
    return '当前账号暂无注销权限，请联系门店';
  }
  return '注销失败，请稍后重试';
}

export default function AccountPage() {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [ledger, setLedger] = useState<PaymentLedgerItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [notifications, setNotifications] = useState<CustomerNotificationItem[]>([]);
  const [notificationSummary, setNotificationSummary] = useState<CustomerNotificationSummary>(
    EMPTY_NOTIFICATION_SUMMARY,
  );
  const [notificationPreference, setNotificationPreference] =
    useState<CustomerNotificationPreference | null>(null);
  const [executionResultSubscribed, setExecutionResultSubscribed] = useState(true);
  const [notificationFrequencyPreset, setNotificationFrequencyPreset] =
    useState<NotificationFrequencyPreset>('STANDARD');
  const [customerStability, setCustomerStability] = useState<CustomerStabilitySnapshot | null>(null);
  const [feedbackTickets, setFeedbackTickets] = useState<FeedbackTicket[]>([]);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackTicketCategory>('OTHER');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackContact, setFeedbackContact] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackErrorMessage, setFeedbackErrorMessage] = useState('');
  const [expandedFeedbackTicketId, setExpandedFeedbackTicketId] = useState('');
  const [feedbackDetailLoadingTicketId, setFeedbackDetailLoadingTicketId] = useState('');

  const [loading, setLoading] = useState(true);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationPreferenceLoading, setNotificationPreferenceLoading] = useState(false);
  const [notificationPreferenceSaving, setNotificationPreferenceSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notificationErrorMessage, setNotificationErrorMessage] = useState('');
  const [notificationPreferenceErrorMessage, setNotificationPreferenceErrorMessage] = useState('');
  const [notificationPreferenceNoticeMessage, setNotificationPreferenceNoticeMessage] = useState('');
  const [stabilityErrorMessage, setStabilityErrorMessage] = useState('');
  const [privacyMessage, setPrivacyMessage] = useState('');
  const [cancelArmed, setCancelArmed] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [customerUserId, setCustomerUserId] = useState('');
  const touchpointContract = snapshot?.touchpointContract || null;

  const lifecycleTouchpoints = useMemo(() => {
    const rows = touchpointContract?.recentTouchpoints || [];
    return LIFECYCLE_STAGE_ORDER.map((stage) => {
      const matched = rows.find((item) => String(item.stage || '').trim() === stage);
      return {
        stage,
        outcome: matched?.outcome || 'INFO',
        explanation: matched?.explanation || '暂无触达记录，系统会在满足条件后推送权益。',
        reasonCode: matched?.reasonCode,
      };
    });
  }, [touchpointContract]);

  const gameSummary = useMemo(() => {
    const summary = snapshot?.gameSummary;
    return {
      collectibleCount: Number(summary?.collectibleCount || 0),
      unlockedGameCount: Number(summary?.unlockedGameCount || 0),
      touchpointCount: Number(summary?.touchpointCount || 0),
    };
  }, [snapshot?.gameSummary]);

  const gameTouchpoints = useMemo(() => {
    const rows = Array.isArray(snapshot?.gameTouchpoints) ? snapshot?.gameTouchpoints : [];
    return rows.slice(0, 3);
  }, [snapshot?.gameTouchpoints]);
  const executionConsistencyRecords = useMemo(
    () => buildExecutionConsistencyRecords(notifications, 6),
    [notifications],
  );
  const hasConsistencyConflict = useMemo(
    () =>
      hasTouchpointConsistencyConflict(
        touchpointContract?.recentTouchpoints || [],
        executionConsistencyRecords,
      ),
    [executionConsistencyRecords, touchpointContract?.recentTouchpoints],
  );

  const storeId = useMemo(() => {
    return String(storage.getLastStoreId() || DEFAULT_STORE_ID || '').trim();
  }, []);

  const resolveUserId = useCallback(() => {
    return String(storage.getCustomerUserId() || '').trim();
  }, []);

  const getUnreadCountByCategory = useCallback(
    (category: string): number => {
      const normalized = String(category || '').trim().toUpperCase();
      const byCategory = Array.isArray(notificationSummary.byCategory) ? notificationSummary.byCategory : [];
      const row = byCategory.find((item) => String(item.category || '').trim().toUpperCase() === normalized);
      return Number(row?.unreadCount || 0);
    },
    [notificationSummary.byCategory],
  );

  const updateFeedbackTicketInList = useCallback((ticket: FeedbackTicket) => {
    setFeedbackTickets((prev) => {
      const rows = Array.isArray(prev) ? prev : [];
      const exists = rows.some((item) => item.ticketId === ticket.ticketId);
      if (exists) {
        return rows.map((item) => (item.ticketId === ticket.ticketId ? ticket : item));
      }
      return [ticket, ...rows];
    });
  }, []);

  const loadNotifications = useCallback(
    async ({ autoMarkRead = false }: { autoMarkRead?: boolean } = {}) => {
      if (!storeId) {
        return;
      }
      setNotificationLoading(true);
      setNotificationErrorMessage('');
      const resolvedUserId = resolveUserId();
      try {
        const [summaryResult, inboxResult] = await Promise.all([
          DataService.getNotificationUnreadSummary(storeId, resolvedUserId),
          DataService.getNotificationInbox(storeId, resolvedUserId, {
            status: 'ALL',
            category: 'ALL',
            limit: 20,
          }),
        ]);

        let nextSummary = summaryResult;
        let nextNotifications = inboxResult.items;
        const hasUnread =
          Number(summaryResult.totalUnread || 0) > 0 ||
          nextNotifications.some((item) => String(item.status || '').toUpperCase() === 'UNREAD');

        if (autoMarkRead && hasUnread) {
          await DataService.markNotificationsRead(storeId, resolvedUserId, {
            markAll: true,
          });
          const [summaryAfterRead, inboxAfterRead] = await Promise.all([
            DataService.getNotificationUnreadSummary(storeId, resolvedUserId),
            DataService.getNotificationInbox(storeId, resolvedUserId, {
              status: 'ALL',
              category: 'ALL',
              limit: 20,
            }),
          ]);
          nextSummary = summaryAfterRead;
          nextNotifications = inboxAfterRead.items;
        }

        setNotificationSummary(nextSummary);
        setNotifications(nextNotifications);
      } catch (error) {
        console.error('[Account] load notifications failed', error);
        setNotificationErrorMessage('提醒暂不可用，可稍后刷新');
      } finally {
        setNotificationLoading(false);
      }
    },
    [resolveUserId, storeId],
  );

  const loadNotificationPreferences = useCallback(async () => {
    if (!storeId) {
      return;
    }
    setNotificationPreferenceLoading(true);
    setNotificationPreferenceErrorMessage('');
    try {
      const result = await DataService.getNotificationPreferences(storeId, resolveUserId());
      setNotificationPreference(result);
      setExecutionResultSubscribed(result.categories.EXECUTION_RESULT !== false);
      setNotificationFrequencyPreset(resolveNotificationFrequencyPresetByCap(result));
    } catch (error) {
      console.error('[Account] load notification preferences failed', error);
      setNotificationPreference(null);
      setNotificationPreferenceErrorMessage('提醒偏好暂不可用，可稍后刷新');
    } finally {
      setNotificationPreferenceLoading(false);
    }
  }, [resolveUserId, storeId]);

  const loadFeedbackTickets = useCallback(async () => {
    if (!storeId) {
      return;
    }
    setFeedbackLoading(true);
    setFeedbackErrorMessage('');
    try {
      const result = await DataService.getFeedbackTickets(storeId, resolveUserId(), {
        status: 'ALL',
        category: 'ALL',
        limit: 10,
      });
      setFeedbackTickets(result.items || []);
    } catch (error) {
      console.error('[Account] load feedback tickets failed', error);
      setFeedbackErrorMessage('反馈记录暂不可用，可稍后刷新');
      setFeedbackTickets([]);
    } finally {
      setFeedbackLoading(false);
    }
  }, [resolveUserId, storeId]);

  const loadCustomerStability = useCallback(async () => {
    if (!storeId) {
      return;
    }
    setStabilityErrorMessage('');
    try {
      const result = await DataService.getCustomerStabilitySnapshot(storeId, resolveUserId());
      setCustomerStability(result);
    } catch (error) {
      console.error('[Account] load customer stability failed', error);
      setCustomerStability(null);
      setStabilityErrorMessage('稳定性暂不可用，可稍后刷新');
    }
  }, [resolveUserId, storeId]);

  const loadData = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      Taro.reLaunch({ url: '/pages/startup/index' });
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setStabilityErrorMessage('');
    const resolvedUserId = resolveUserId();
    try {
      const [nextSnapshot, nextLedger, nextInvoices] = await Promise.all([
        DataService.getHomeSnapshot(storeId, resolvedUserId),
        DataService.getPaymentLedger(storeId, resolvedUserId, 20),
        DataService.getInvoices(storeId, resolvedUserId, 20),
      ]);
      setSnapshot(nextSnapshot);
      setLedger(nextLedger);
      setInvoices(nextInvoices);
      setCustomerUserId(resolveUserId());
      await Promise.all([
        loadNotifications({ autoMarkRead: true }),
        loadNotificationPreferences(),
        loadFeedbackTickets(),
        loadCustomerStability(),
      ]);
    } catch (error) {
      console.error('[Account] load data failed', error);
      setErrorMessage('加载失败，请重试');
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [
    loadCustomerStability,
    loadFeedbackTickets,
    loadNotificationPreferences,
    loadNotifications,
    resolveUserId,
    storeId,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveNotificationPreferences = useCallback(async () => {
    if (!storeId || notificationPreferenceSaving) {
      return;
    }
    setNotificationPreferenceSaving(true);
    setNotificationPreferenceErrorMessage('');
    setNotificationPreferenceNoticeMessage('');
    try {
      const frequencyCap =
        notificationFrequencyPreset === 'LOW_DISTURBANCE'
          ? EXECUTION_RESULT_LOW_DISTURBANCE_CAP
          : EXECUTION_RESULT_STANDARD_CAP;
      const result = await DataService.setNotificationPreferences(storeId, resolveUserId(), {
        categories: {
          EXECUTION_RESULT: executionResultSubscribed,
        },
        frequencyCaps: {
          EXECUTION_RESULT: frequencyCap,
        },
      });
      setNotificationPreference(result);
      setExecutionResultSubscribed(result.categories.EXECUTION_RESULT !== false);
      setNotificationFrequencyPreset(resolveNotificationFrequencyPresetByCap(result));
      setNotificationPreferenceNoticeMessage('提醒偏好已更新');
      await loadNotifications();
    } catch (error) {
      console.error('[Account] set notification preferences failed', error);
      setNotificationPreferenceErrorMessage('提醒偏好更新失败，请稍后重试');
    } finally {
      setNotificationPreferenceSaving(false);
    }
  }, [
    executionResultSubscribed,
    loadNotifications,
    notificationFrequencyPreset,
    notificationPreferenceSaving,
    resolveUserId,
    storeId,
  ]);

  const handleSubmitFeedback = useCallback(async () => {
    if (!storeId || feedbackSubmitting) {
      return;
    }
    const safeTitle = feedbackTitle.trim();
    const safeDescription = feedbackDescription.trim();
    if (!safeTitle) {
      Taro.showToast({ title: '请填写问题标题', icon: 'none' });
      return;
    }
    if (!safeDescription) {
      Taro.showToast({ title: '请填写问题描述', icon: 'none' });
      return;
    }
    setFeedbackSubmitting(true);
    setFeedbackErrorMessage('');
    try {
      const ticket = await DataService.createFeedbackTicket(storeId, resolveUserId(), {
        category: feedbackCategory,
        title: safeTitle,
        description: safeDescription,
        contact: feedbackContact.trim(),
      });
      updateFeedbackTicketInList(ticket);
      setExpandedFeedbackTicketId(ticket.ticketId);
      setFeedbackTitle('');
      setFeedbackDescription('');
      Taro.showToast({ title: '反馈已提交', icon: 'none' });
      await loadFeedbackTickets();
    } catch (error) {
      console.error('[Account] submit feedback failed', error);
      setFeedbackErrorMessage('提交失败，请稍后重试');
      Taro.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [
    feedbackCategory,
    feedbackContact,
    feedbackDescription,
    feedbackSubmitting,
    feedbackTitle,
    loadFeedbackTickets,
    resolveUserId,
    storeId,
    updateFeedbackTicketInList,
  ]);

  const handleToggleFeedbackDetail = useCallback(
    async (ticket: FeedbackTicket) => {
      if (!storeId) {
        return;
      }
      if (expandedFeedbackTicketId === ticket.ticketId) {
        setExpandedFeedbackTicketId('');
        return;
      }
      setExpandedFeedbackTicketId(ticket.ticketId);
      if (Array.isArray(ticket.timeline) && ticket.timeline.length > 0) {
        return;
      }
      setFeedbackDetailLoadingTicketId(ticket.ticketId);
      try {
        const detail = await DataService.getFeedbackTicketDetail(storeId, resolveUserId(), ticket.ticketId);
        updateFeedbackTicketInList(detail);
      } catch (error) {
        console.error('[Account] load feedback detail failed', error);
        Taro.showToast({ title: '进展加载失败，请稍后重试', icon: 'none' });
      } finally {
        setFeedbackDetailLoadingTicketId('');
      }
    },
    [expandedFeedbackTicketId, resolveUserId, storeId, updateFeedbackTicketInList],
  );

  const handleCancelAccount = useCallback(async () => {
    if (!storeId || canceling) {
      return;
    }
    if (!cancelArmed) {
      setPrivacyMessage('请确认已完成账票查询与资产核对，再执行注销。');
      setCancelArmed(true);
      Taro.showToast({ title: '再次点击确认注销', icon: 'none' });
      return;
    }

    setCanceling(true);
    setPrivacyMessage('');
    try {
      const resolvedUserId = customerUserId || resolveUserId();
      if (!resolvedUserId) {
        throw new Error('user not found');
      }
      await DataService.cancelAccount(storeId, resolvedUserId);
      storage.clearCustomerSession(storeId, resolvedUserId);
      Taro.showToast({ title: '账号已注销', icon: 'none' });
      Taro.reLaunch({ url: '/pages/startup/index' });
    } catch (error) {
      console.error('[Account] cancel account failed', error);
      const message = resolveCancelAccountErrorMessage(error);
      setPrivacyMessage(message);
      Taro.showToast({ title: message, icon: 'none' });
    } finally {
      setCanceling(false);
      setCancelArmed(false);
    }
  }, [cancelArmed, canceling, customerUserId, resolveUserId, storeId]);

  return (
    <View className='account-page'>
      <View className='account-page__header'>
        <Text id='account-page-title' className='account-page__title'>
          账户中心
        </Text>
        <Text className='account-page__subtitle'>
          {snapshot?.store.name || 'MealQuest'} · {storeId}
        </Text>
      </View>

      <View className='account-card account-card--wallet'>
        <Text className='account-card__title'>钱包资产</Text>
        <View className='account-wallet'>
          <View className='account-wallet__item'>
            <Text className='account-wallet__label'>本金</Text>
            <Text className='account-wallet__value'>{toMoney(snapshot?.wallet.principal || 0)}</Text>
          </View>
          <View className='account-wallet__item'>
            <Text className='account-wallet__label'>赠送金</Text>
            <Text className='account-wallet__value'>{toMoney(snapshot?.wallet.bonus || 0)}</Text>
          </View>
          <View className='account-wallet__item'>
            <Text className='account-wallet__label'>碎银</Text>
            <Text className='account-wallet__value'>
              {Number(snapshot?.wallet.silver || 0).toFixed(0)} 两
            </Text>
          </View>
        </View>
      </View>

      <View className='account-card'>
        <Text id='account-stability-title' className='account-card__title'>
          服务稳定性
        </Text>
        <Text className='account-touchpoint-objective'>
          基于支付与合规信号生成稳定性提示，帮助你判断当前服务状态。
        </Text>
        <View
          id='account-stability-refresh-button'
          className='account-btn account-btn--ghost account-btn--notification'
          onClick={() => {
            void loadCustomerStability();
          }}
        >
          刷新稳定性
        </View>
        {stabilityErrorMessage ? <Text className='account-error'>{stabilityErrorMessage}</Text> : null}
        {!stabilityErrorMessage && !customerStability ? <Text className='account-empty'>稳定性评估中...</Text> : null}
        {customerStability ? (
          <>
            <View className='account-touchpoint-item'>
              <Text className='account-touchpoint-item__title'>当前状态：{customerStability.stabilityLabel}</Text>
              <Text className='account-touchpoint-item__desc'>{customerStability.summary}</Text>
              <Text className='account-touchpoint-item__reason'>
                评估时间：{new Date(customerStability.evaluatedAt).toLocaleString()}
              </Text>
            </View>
            <View className='account-touchpoint-list'>
              {customerStability.drivers.map((item) => (
                <View key={item.code} className='account-touchpoint-item'>
                  <Text className='account-touchpoint-item__title'>
                    {item.label} · {resolveStabilityDriverStatusLabel(item.status)}
                  </Text>
                </View>
              ))}
            </View>
            {customerStability.reasons.length === 0 ? (
              <Text className='account-empty'>当前未发现影响服务稳定性的风险信号。</Text>
            ) : (
              <View className='account-touchpoint-list'>
                {customerStability.reasons.map((item) => (
                  <View key={item.code} className='account-touchpoint-item'>
                    <Text className='account-touchpoint-item__title'>提示 · {item.code}</Text>
                    <Text className='account-touchpoint-item__desc'>{item.message}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : null}
      </View>

      <View className='account-card'>
        <Text id='account-touchpoint-title' className='account-card__title'>
          触达口径摘要
        </Text>
        <Text className='account-touchpoint-objective'>
          {touchpointContract?.objectiveLabel || '口径暂不可用，请稍后刷新重试。'}
        </Text>
        {touchpointContract ? (
          <>
            <View className='account-touchpoint-signals'>
              {touchpointContract.behaviorSignals.map((signal) => (
                <View key={signal} className='account-touchpoint-signal'>
                  {signal}
                </View>
              ))}
            </View>
            <View className='account-touchpoint-list'>
              {touchpointContract.recentTouchpoints.length === 0 ? (
                <Text className='account-empty'>暂无触达记录</Text>
              ) : (
                touchpointContract.recentTouchpoints.slice(0, 3).map((item) => (
                  <View key={item.activityId} className='account-touchpoint-item'>
                    <Text className='account-touchpoint-item__title'>
                      {item.stage} · {item.outcome === 'HIT' ? '已命中' : item.outcome === 'BLOCKED' ? '未命中' : '进行中'}
                    </Text>
                    <Text className='account-touchpoint-item__desc'>{item.explanation}</Text>
                    {item.reasonCode ? (
                      <Text className='account-touchpoint-item__reason'>原因码：{item.reasonCode}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
            <View className='account-lifecycle-stage-list'>
              <Text className='account-card__subtitle'>生命周期阶段记录</Text>
              {lifecycleTouchpoints.map((item) => (
                <View key={item.stage} className='account-lifecycle-stage-item'>
                  <Text className='account-touchpoint-item__title'>
                    {item.stage} · {item.outcome === 'HIT' ? '已命中' : item.outcome === 'BLOCKED' ? '未命中' : '进行中'}
                  </Text>
                  <Text className='account-touchpoint-item__desc'>{item.explanation}</Text>
                  {item.reasonCode ? (
                    <Text className='account-touchpoint-item__reason'>原因码：{item.reasonCode}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <View className='account-card'>
        <Text id='account-notification-title' className='account-card__title'>
          消息提醒
        </Text>
        <Text className='account-notification-summary'>
          未读总数：{Number(notificationSummary.totalUnread || 0)} · 审批待办：
          {getUnreadCountByCategory('APPROVAL_TODO')} · 执行结果：
          {getUnreadCountByCategory('EXECUTION_RESULT')} · 反馈进展：
          {getUnreadCountByCategory('FEEDBACK_TICKET')}
        </Text>
        <View
          id='account-notification-refresh-button'
          className='account-btn account-btn--ghost account-btn--notification'
          onClick={() => {
            void loadNotifications();
          }}
        >
          刷新提醒
        </View>
        <View className='account-notification-preference'>
          <Text id='account-notification-preference-title' className='account-card__subtitle'>
            提醒订阅与降打扰
          </Text>
          <Text className='account-touchpoint-item__desc'>
            仅管理“执行结果”提醒，可按偏好减少消息打扰。
          </Text>
          <View className='account-notification-preference-actions'>
            <View
              id='account-notification-toggle-button'
              className={`account-notification-pref-chip ${
                executionResultSubscribed ? 'account-notification-pref-chip--active' : ''
              }`}
              onClick={() => {
                setExecutionResultSubscribed((prev) => !prev);
              }}
            >
              执行结果提醒：{executionResultSubscribed ? '已开启' : '已关闭'}
            </View>
            <View
              id='account-notification-frequency-standard'
              className={`account-notification-pref-chip ${
                notificationFrequencyPreset === 'STANDARD' ? 'account-notification-pref-chip--active' : ''
              }`}
              onClick={() => {
                setNotificationFrequencyPreset('STANDARD');
              }}
            >
              标准（24小时最多3条）
            </View>
            <View
              id='account-notification-frequency-low'
              className={`account-notification-pref-chip ${
                notificationFrequencyPreset === 'LOW_DISTURBANCE' ? 'account-notification-pref-chip--active' : ''
              }`}
              onClick={() => {
                setNotificationFrequencyPreset('LOW_DISTURBANCE');
              }}
            >
              低打扰（24小时最多1条）
            </View>
          </View>
          <Text className='account-touchpoint-item__reason'>
            当前档位：{resolveNotificationFrequencyPresetLabel(notificationFrequencyPreset)}
          </Text>
          <View
            id='account-notification-preference-refresh-button'
            className='account-btn account-btn--ghost account-btn--notification'
            onClick={() => {
              void loadNotificationPreferences();
            }}
          >
            刷新偏好
          </View>
          <View
            id='account-notification-preference-save-button'
            className='account-btn account-btn--ghost account-btn--notification'
            onClick={() => {
              void handleSaveNotificationPreferences();
            }}
          >
            {notificationPreferenceSaving ? '保存中...' : '保存偏好'}
          </View>
          {notificationPreferenceLoading ? <Text className='account-loading'>偏好加载中...</Text> : null}
          {notificationPreferenceErrorMessage ? (
            <Text className='account-error'>{notificationPreferenceErrorMessage}</Text>
          ) : null}
          {notificationPreferenceNoticeMessage ? (
            <Text className='account-notification-preference-notice'>{notificationPreferenceNoticeMessage}</Text>
          ) : null}
          {notificationPreference ? (
            <Text className='account-touchpoint-item__reason'>
              最近更新：
              {notificationPreference.updatedAt
                ? new Date(notificationPreference.updatedAt).toLocaleString()
                : '暂无'}
            </Text>
          ) : null}
        </View>
        {notificationLoading ? <Text className='account-loading'>提醒刷新中...</Text> : null}
        {notificationErrorMessage ? <Text className='account-error'>{notificationErrorMessage}</Text> : null}
        {!notificationLoading && notifications.length === 0 ? (
          <Text className='account-empty'>
            {!executionResultSubscribed ? '你已关闭执行结果提醒，可在上方重新开启。' : '暂无提醒'}
          </Text>
        ) : null}
        {notifications.slice(0, 6).map((item) => (
          <View className='account-touchpoint-item' key={item.notificationId}>
            <Text className='account-touchpoint-item__title'>
              {resolveNotificationCategoryLabel(item.category)} ·{' '}
              {String(item.status || '').toUpperCase() === 'UNREAD' ? '未读' : '已读'}
            </Text>
            <Text className='account-touchpoint-item__desc'>{item.title}</Text>
            <Text className='account-touchpoint-item__desc'>
              {String(item.category || '').toUpperCase() === 'EXECUTION_RESULT'
                ? '权益结果已更新，可查看下方一致性记录。'
                : item.body || '系统提醒'}
            </Text>
            <Text className='account-touchpoint-item__reason'>
              时间：{new Date(item.createdAt).toLocaleString()}
            </Text>
          </View>
        ))}

        <View className='account-consistency-block'>
          <Text className='account-card__subtitle'>提案执行一致性记录</Text>
          {executionConsistencyRecords.length === 0 ? (
            <Text className='account-empty'>暂无执行记录，后续权益变化会在此展示。</Text>
          ) : (
            executionConsistencyRecords.map((item) => (
              <View className='account-touchpoint-item' key={item.notificationId}>
                <Text className='account-touchpoint-item__title'>
                  {item.stage} · {item.outcomeLabel}
                </Text>
                <Text className='account-touchpoint-item__desc'>{item.explanation}</Text>
                <Text className='account-touchpoint-item__reason'>
                  时间：{new Date(item.createdAt).toLocaleString()}
                </Text>
              </View>
            ))
          )}
          {hasConsistencyConflict ? (
            <Text className='account-consistency-note'>
              口径说明：若与触达摘要不一致，以最新执行结果为准。
            </Text>
          ) : null}
        </View>

        <View className='account-game-feedback'>
          <Text className='account-card__subtitle'>小游戏联动反馈</Text>
          <Text className='account-touchpoint-item__desc'>
            可收集奖励：{gameSummary.collectibleCount} · 已解锁互动：{gameSummary.unlockedGameCount} · 最近互动：
            {gameSummary.touchpointCount}
          </Text>
          {gameTouchpoints.length === 0 ? (
            <Text className='account-empty'>暂无小游戏反馈，完成阶段触达后可查看互动奖励。</Text>
          ) : (
            gameTouchpoints.map((item) => (
              <View className='account-touchpoint-item' key={item.touchpointId}>
                <Text className='account-touchpoint-item__title'>{item.title}</Text>
                <Text className='account-touchpoint-item__desc'>{item.desc}</Text>
                {item.rewardLabel ? (
                  <Text className='account-touchpoint-item__reason'>奖励：{item.rewardLabel}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </View>

      <View className='account-card'>
        <Text id='account-feedback-title' className='account-card__title'>
          问题反馈
        </Text>
        <Text className='account-touchpoint-objective'>
          仅支持文本反馈。提交后可在下方查看处理状态与时间线进展。
        </Text>
        <View className='account-feedback-categories'>
          {FEEDBACK_CATEGORY_OPTIONS.map((item) => (
            <View
              key={item.value}
              id={`account-feedback-category-${item.value}`}
              className={`account-feedback-category-chip ${
                feedbackCategory === item.value ? 'account-feedback-category-chip--active' : ''
              }`}
              onClick={() => {
                setFeedbackCategory(item.value);
              }}
            >
              {item.label}
            </View>
          ))}
        </View>
        <Input
          id='account-feedback-title-input'
          className='account-feedback-input'
          value={feedbackTitle}
          placeholder='请输入问题标题（必填）'
          maxlength={120}
          onInput={(event) => {
            setFeedbackTitle(toInputValue(event));
          }}
        />
        <Textarea
          id='account-feedback-description-textarea'
          className='account-feedback-textarea'
          value={feedbackDescription}
          maxlength={1000}
          placeholder='请描述问题细节与出现步骤（必填）'
          onInput={(event) => {
            setFeedbackDescription(toInputValue(event));
          }}
        />
        <Input
          id='account-feedback-contact-input'
          className='account-feedback-input'
          value={feedbackContact}
          placeholder='联系方式（选填）'
          maxlength={120}
          onInput={(event) => {
            setFeedbackContact(toInputValue(event));
          }}
        />
        <View
          id='account-feedback-submit-button'
          className='account-btn account-btn--ghost account-btn--feedback-submit'
          onClick={() => {
            void handleSubmitFeedback();
          }}
        >
          {feedbackSubmitting ? '提交中...' : '提交反馈'}
        </View>
        <View
          id='account-feedback-refresh-button'
          className='account-btn account-btn--ghost account-btn--feedback-refresh'
          onClick={() => {
            void loadFeedbackTickets();
          }}
        >
          刷新反馈进展
        </View>
        {feedbackLoading ? <Text className='account-loading'>反馈记录加载中...</Text> : null}
        {feedbackErrorMessage ? <Text className='account-error'>{feedbackErrorMessage}</Text> : null}
        {!feedbackLoading && feedbackTickets.length === 0 ? (
          <Text className='account-empty'>暂无反馈记录</Text>
        ) : null}
        {feedbackTickets.map((ticket) => {
          const isExpanded = expandedFeedbackTicketId === ticket.ticketId;
          const detailLoading = feedbackDetailLoadingTicketId === ticket.ticketId;
          const timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
          return (
            <View key={ticket.ticketId} className='account-touchpoint-item'>
              <Text className='account-touchpoint-item__title'>
                {resolveFeedbackCategoryLabel(ticket.category)} · {resolveFeedbackStatusLabel(ticket.status)}
              </Text>
              <Text className='account-touchpoint-item__desc'>{ticket.title}</Text>
              <Text className='account-touchpoint-item__reason'>
                更新时间：{new Date(ticket.updatedAt || ticket.createdAt).toLocaleString()}
              </Text>
              <View
                className='account-feedback-detail-toggle'
                onClick={() => {
                  void handleToggleFeedbackDetail(ticket);
                }}
              >
                {isExpanded ? '收起进展' : '查看进展'}
              </View>
              {isExpanded ? (
                <View className='account-feedback-timeline'>
                  {detailLoading ? <Text className='account-loading'>进展加载中...</Text> : null}
                  {!detailLoading && timeline.length === 0 ? (
                    <Text className='account-empty'>暂无进展记录</Text>
                  ) : null}
                  {!detailLoading
                    ? timeline.map((event) => (
                        <View key={event.eventId} className='account-feedback-timeline-item'>
                          <Text className='account-touchpoint-item__title'>
                            {resolveFeedbackStatusLabel(event.toStatus)}
                          </Text>
                          <Text className='account-touchpoint-item__desc'>
                            {event.note || '状态已更新'}
                          </Text>
                          <Text className='account-touchpoint-item__reason'>
                            时间：{new Date(event.createdAt).toLocaleString()}
                          </Text>
                        </View>
                      ))
                    : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View className='account-card'>
        <Text className='account-card__title'>隐私与账号管理</Text>
        <Text className='account-touchpoint-objective'>
          注销后将删除非交易型个人信息；交易与发票数据会按法规与对账要求保留。
        </Text>
        <Text className='account-touchpoint-item__reason'>
          建议先完成账票查询与争议反馈，再执行注销操作。
        </Text>
        {privacyMessage ? <Text className='account-error'>{privacyMessage}</Text> : null}
      </View>

      <View className='account-actions'>
        <View id='account-refresh-button' className='account-btn account-btn--ghost' onClick={loadData}>
          刷新
        </View>
        <View
          id='account-cancel-button'
          className='account-btn account-btn--danger'
          onClick={handleCancelAccount}
        >
          {canceling ? '注销中...' : cancelArmed ? '确认注销' : '注销账号'}
        </View>
      </View>

      {loading ? <Text className='account-loading'>加载中...</Text> : null}
      {!loading && errorMessage ? <Text className='account-error'>{errorMessage}</Text> : null}

      <View className='account-card'>
        <Text id='account-ledger-title' className='account-card__title'>
          支付流水
        </Text>
        {ledger.length === 0 && <Text className='account-empty'>暂无流水</Text>}
        {ledger.map((item) => (
          <View className='account-row' key={item.txnId}>
            <Text className='account-row__label'>{item.type}</Text>
            <Text className='account-row__value'>{toMoney(item.amount)}</Text>
            <Text className='account-row__meta'>{new Date(item.timestamp).toLocaleString()}</Text>
          </View>
        ))}
      </View>

      <View className='account-card'>
        <Text id='account-invoice-title' className='account-card__title'>
          电子发票
        </Text>
        {invoices.length === 0 && <Text className='account-empty'>暂无发票</Text>}
        {invoices.map((invoice) => (
          <View className='account-row' key={invoice.invoiceNo}>
            <Text className='account-row__label'>{invoice.invoiceNo}</Text>
            <Text className='account-row__value'>{toMoney(invoice.amount)}</Text>
            <Text className='account-row__meta'>{invoice.status}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
