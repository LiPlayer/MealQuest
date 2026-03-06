import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';

import { DataService } from '@/services/DataService';
import {
  CustomerNotificationItem,
  CustomerNotificationSummary,
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
  if (normalized === 'GENERAL') {
    return '系统提醒';
  }
  return normalized || '提醒';
}

export default function AccountPage() {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [ledger, setLedger] = useState<PaymentLedgerItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [notifications, setNotifications] = useState<CustomerNotificationItem[]>([]);
  const [notificationSummary, setNotificationSummary] = useState<CustomerNotificationSummary>(
    EMPTY_NOTIFICATION_SUMMARY,
  );
  const [loading, setLoading] = useState(true);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notificationErrorMessage, setNotificationErrorMessage] = useState('');
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

  const loadData = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      Taro.reLaunch({ url: '/pages/startup/index' });
      return;
    }

    setLoading(true);
    setErrorMessage('');
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
      await loadNotifications({ autoMarkRead: true });
    } catch (error) {
      console.error('[Account] load data failed', error);
      setErrorMessage('加载失败，请重试');
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [loadNotifications, resolveUserId, storeId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCancelAccount = useCallback(async () => {
    if (!storeId || canceling) {
      return;
    }
    if (!cancelArmed) {
      setCancelArmed(true);
      Taro.showToast({ title: '再次点击确认注销', icon: 'none' });
      return;
    }

    setCanceling(true);
    try {
      const resolvedUserId = customerUserId || resolveUserId();
      await DataService.cancelAccount(storeId, resolvedUserId);
      storage.clearCustomerSession(storeId, resolvedUserId);
      Taro.showToast({ title: '账号已注销', icon: 'none' });
      Taro.reLaunch({ url: '/pages/startup/index' });
    } catch (error) {
      console.error('[Account] cancel account failed', error);
      Taro.showToast({ title: '注销失败，请稍后重试', icon: 'none' });
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
          {getUnreadCountByCategory('EXECUTION_RESULT')}
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
        {notificationLoading ? <Text className='account-loading'>提醒刷新中...</Text> : null}
        {notificationErrorMessage ? <Text className='account-error'>{notificationErrorMessage}</Text> : null}
        {!notificationLoading && notifications.length === 0 ? (
          <Text className='account-empty'>暂无提醒</Text>
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
