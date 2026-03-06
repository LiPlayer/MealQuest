import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';

import ActivityArea from '@/components/ActivityArea';
import CustomerBottomDock from '@/components/CustomerBottomDock';
import CustomerCardStack from '@/components/CustomerCardStack';
import ShopBrand from '@/components/ShopBrand';
import { buildSmartCheckoutQuote } from '@/domain/smartCheckout';
import { CustomerNotificationItem, CustomerStabilitySnapshot, HomeSnapshot } from '@/services/dataTypes';
import { buildExecutionConsistencyRecords } from '@/services/customerApp/executionConsistency';
import { DataService } from '@/services/DataService';
import { storage } from '@/utils/storage';

import './index.scss';

const DEFAULT_STORE_ID =
  (typeof process !== 'undefined' && process.env && process.env.TARO_APP_DEFAULT_STORE_ID) || '';
const DEFAULT_ORDER_AMOUNT = 52;
const LIFECYCLE_STAGE_ORDER = ['获客', '激活', '活跃', '扩收', '留存'];

type LifecycleStageStatus = {
  stage: string;
  outcome: 'HIT' | 'BLOCKED' | 'INFO';
  explanation: string;
};

function toOrderAmount(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ORDER_AMOUNT;
  }
  return Math.round(parsed * 100) / 100;
}

function toAutoPay(raw: unknown): boolean {
  const normalized = String(raw || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'pay', 'payment'].includes(normalized);
}

function toMoney(value: number): string {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function toOutcomeText(value: LifecycleStageStatus['outcome']): string {
  if (value === 'HIT') {
    return '已命中';
  }
  if (value === 'BLOCKED') {
    return '未命中';
  }
  return '进行中';
}

function buildLifecycleStages(snapshot: HomeSnapshot | null): LifecycleStageStatus[] {
  const recentTouchpoints =
    snapshot &&
    snapshot.touchpointContract &&
    Array.isArray(snapshot.touchpointContract.recentTouchpoints)
      ? snapshot.touchpointContract.recentTouchpoints
      : [];

  return LIFECYCLE_STAGE_ORDER.map((stage) => {
    const matched = recentTouchpoints.find((item) => String(item.stage || '').trim() === stage);
    return {
      stage,
      outcome: matched?.outcome || 'INFO',
      explanation: matched?.explanation || '暂无触达记录，系统会在满足条件后推送阶段权益。',
    };
  });
}

function resolveStabilityGuardDescription(level: string): string {
  const normalized = String(level || '').trim().toUpperCase();
  if (normalized === 'UNSTABLE') {
    return '触达能力可能短时波动，系统已进入保护态，支付、账票与账户主链路不受影响。';
  }
  if (normalized === 'WATCH') {
    return '灰度观察中，系统已启用保护提示，支付与账户主链路不受影响。';
  }
  return '灰度影响受控，支付与账户主链路可正常使用。';
}

export default function IndexPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastReceipt, setLastReceipt] = useState('');
  const [executionNotifications, setExecutionNotifications] = useState<CustomerNotificationItem[]>([]);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionErrorMessage, setExecutionErrorMessage] = useState('');
  const [stabilitySnapshot, setStabilitySnapshot] = useState<CustomerStabilitySnapshot | null>(null);
  const [stabilityLoading, setStabilityLoading] = useState(false);
  const [stabilityErrorMessage, setStabilityErrorMessage] = useState('');
  const autoPayHintShownRef = useRef(false);

  const storeId = useMemo(() => {
    return String(storage.getLastStoreId() || DEFAULT_STORE_ID || '').trim();
  }, []);

  const orderAmount = useMemo(() => {
    const params = (router.params || {}) as Record<string, unknown>;
    return toOrderAmount(params.orderAmount ?? params.amount);
  }, [router.params]);

  const shouldAutoPay = useMemo(() => {
    const params = (router.params || {}) as Record<string, unknown>;
    return toAutoPay(params.autoPay ?? params.pay ?? params.action);
  }, [router.params]);

  const quote = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    return buildSmartCheckoutQuote(orderAmount, snapshot.wallet, snapshot.vouchers);
  }, [orderAmount, snapshot]);

  const lifecycleStages = useMemo(() => buildLifecycleStages(snapshot), [snapshot]);
  const executionRecords = useMemo(
    () => buildExecutionConsistencyRecords(executionNotifications, 2),
    [executionNotifications],
  );

  const gameSummary = useMemo(() => {
    if (!snapshot || !snapshot.gameSummary) {
      return {
        collectibleCount: 0,
        unlockedGameCount: 0,
        touchpointCount: 0,
      };
    }
    return {
      collectibleCount: Number(snapshot.gameSummary.collectibleCount || 0),
      unlockedGameCount: Number(snapshot.gameSummary.unlockedGameCount || 0),
      touchpointCount: Number(snapshot.gameSummary.touchpointCount || 0),
    };
  }, [snapshot]);

  const gameTouchpoints = useMemo(() => {
    const rows = snapshot && Array.isArray(snapshot.gameTouchpoints) ? snapshot.gameTouchpoints : [];
    return rows.slice(0, 3);
  }, [snapshot]);

  const loadExecutionConsistency = useCallback(async () => {
    if (!storeId) {
      return;
    }
    setExecutionLoading(true);
    setExecutionErrorMessage('');
    try {
      const result = await DataService.getNotificationInbox(storeId, '', {
        status: 'ALL',
        category: 'EXECUTION_RESULT',
        limit: 6,
      });
      setExecutionNotifications(Array.isArray(result.items) ? result.items : []);
    } catch (error) {
      console.error('[Index] load execution consistency failed', error);
      setExecutionErrorMessage('权益变更说明暂不可用，可稍后刷新。');
      setExecutionNotifications([]);
    } finally {
      setExecutionLoading(false);
    }
  }, [storeId]);

  const loadStabilityGuard = useCallback(async () => {
    if (!storeId) {
      return;
    }
    setStabilityLoading(true);
    setStabilityErrorMessage('');
    try {
      const result = await DataService.getCustomerStabilitySnapshot(storeId, '');
      setStabilitySnapshot(result);
    } catch (error) {
      console.error('[Index] load stability guard failed', error);
      setStabilitySnapshot(null);
      setStabilityErrorMessage('守护状态暂不可用，可稍后刷新。');
    } finally {
      setStabilityLoading(false);
    }
  }, [storeId]);

  const loadSnapshot = useCallback(async () => {
    if (!storeId) {
      Taro.reLaunch({ url: '/pages/startup/index' });
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const nextSnapshot = await DataService.getHomeSnapshot(storeId);
      setSnapshot(nextSnapshot);
      void loadExecutionConsistency();
      void loadStabilityGuard();
    } catch (error) {
      console.error('[Index] load snapshot failed', error);
      setErrorMessage('加载失败，请稍后重试');
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [loadExecutionConsistency, loadStabilityGuard, storeId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snapshot || !shouldAutoPay || autoPayHintShownRef.current) {
      return;
    }
    autoPayHintShownRef.current = true;
    Taro.showToast({ title: '已进入支付确认页', icon: 'none' });
  }, [shouldAutoPay, snapshot]);

  const handleOpenAccount = useCallback(() => {
    Taro.navigateTo({ url: '/pages/account/index' });
  }, []);

  const handlePay = useCallback(async () => {
    if (!snapshot || !storeId || paying) {
      return;
    }
    setPaying(true);
    try {
      const result = await DataService.executeCheckout(storeId, orderAmount);
      setSnapshot(result.snapshot);
      void loadStabilityGuard();
      setLastReceipt(`支付成功：${result.paymentId}`);
      Taro.showToast({ title: '支付成功', icon: 'none' });
    } catch (error) {
      console.error('[Index] execute checkout failed', error);
      Taro.showToast({ title: '支付失败，请重试', icon: 'none' });
    } finally {
      setPaying(false);
    }
  }, [loadStabilityGuard, orderAmount, paying, snapshot, storeId]);

  return (
    <View className='index-page'>
      <View className='index-head-actions'>
        <View className='index-order-chip'>订单金额 {toMoney(orderAmount)}</View>
        <View id='index-account-entry' className='index-account-chip' onClick={handleOpenAccount}>
          账户中心
        </View>
      </View>

      <ScrollView scrollY className='index-scroll'>
        <View className='index-content'>
          <ShopBrand
            name={snapshot?.store.name || 'MealQuest'}
            branchName={snapshot?.store.branchName || '默认门店'}
            slogan={snapshot?.store.slogan || '支付不是结束，而是资产关系的开始'}
            logo={snapshot?.store.logo}
            isOpen={Boolean(snapshot?.store.isOpen ?? true)}
          />

          {loading ? (
            <View className='index-state'>
              <View className='index-state__spinner' />
              <Text className='index-state__text'>正在加载资产首屏...</Text>
            </View>
          ) : null}

          {!loading && errorMessage ? (
            <View className='index-state index-state--error'>
              <Text className='index-state__text'>{errorMessage}</Text>
              <View className='index-state__btn' onClick={loadSnapshot}>
                <Text className='index-state__btn-text'>重新加载</Text>
              </View>
            </View>
          ) : null}

          {!loading && snapshot ? (
            <>
              <View className='index-section'>
                <Text className='index-section__title'>我的资产</Text>
                <CustomerCardStack
                  wallet={snapshot.wallet}
                  vouchers={snapshot.vouchers}
                  fragments={snapshot.fragments}
                />
              </View>

              <View className='index-section'>
                <Text id='index-lifecycle-title' className='index-section__title'>
                  生命周期进度
                </Text>
                <View className='index-lifecycle-grid'>
                  {lifecycleStages.map((item) => (
                    <View key={item.stage} className='index-lifecycle-item'>
                      <Text className='index-lifecycle-item__stage'>{item.stage}</Text>
                      <Text className='index-lifecycle-item__status'>{toOutcomeText(item.outcome)}</Text>
                      <Text className='index-lifecycle-item__desc'>{item.explanation}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className='index-section'>
                <Text id='index-stability-guard-title' className='index-section__title'>
                  灰度体验守护
                </Text>
                <View className='index-execution-card'>
                  <Text className='index-execution-item__desc'>
                    顾客侧仅展示可理解守护状态，不展示实验流量与分组等经营信息。
                  </Text>
                  <View
                    id='index-stability-guard-refresh-button'
                    className='index-state__btn'
                    onClick={() => {
                      void loadStabilityGuard();
                    }}
                  >
                    <Text className='index-state__btn-text'>刷新守护状态</Text>
                  </View>
                  {stabilityLoading ? <Text className='index-execution-loading'>守护状态加载中...</Text> : null}
                  {!stabilityLoading && stabilityErrorMessage ? (
                    <Text className='index-execution-error'>{stabilityErrorMessage}</Text>
                  ) : null}
                  {!stabilityLoading && !stabilityErrorMessage && !stabilitySnapshot ? (
                    <Text className='index-execution-empty'>守护状态评估中...</Text>
                  ) : null}
                  {!stabilityLoading && !stabilityErrorMessage && stabilitySnapshot ? (
                    <>
                      <View className='index-execution-item'>
                        <Text className='index-execution-item__title'>
                          当前状态：{stabilitySnapshot.stabilityLabel}
                        </Text>
                        <Text className='index-execution-item__desc'>
                          {resolveStabilityGuardDescription(stabilitySnapshot.stabilityLevel)}
                        </Text>
                        <Text className='index-execution-item__meta'>
                          评估时间：{new Date(stabilitySnapshot.evaluatedAt).toLocaleString()}
                        </Text>
                      </View>
                      {stabilitySnapshot.reasons.slice(0, 2).map((item) => (
                        <View key={item.code} className='index-execution-item'>
                          <Text className='index-execution-item__title'>提示 · {item.code}</Text>
                          <Text className='index-execution-item__desc'>{item.message}</Text>
                        </View>
                      ))}
                    </>
                  ) : null}
                </View>
              </View>

              <View className='index-section'>
                <Text id='index-execution-consistency-title' className='index-section__title'>
                  最新权益变更说明
                </Text>
                <View className='index-execution-card'>
                  {executionLoading ? <Text className='index-execution-loading'>权益结果加载中...</Text> : null}
                  {!executionLoading && executionErrorMessage ? (
                    <Text className='index-execution-error'>{executionErrorMessage}</Text>
                  ) : null}
                  {!executionLoading && !executionErrorMessage && executionRecords.length === 0 ? (
                    <Text className='index-execution-empty'>暂无执行记录，后续命中权益后会在此展示。</Text>
                  ) : null}
                  {!executionLoading && !executionErrorMessage
                    ? executionRecords.map((item) => (
                        <View key={item.notificationId} className='index-execution-item'>
                          <Text className='index-execution-item__title'>
                            {item.stage} · {item.outcomeLabel}
                          </Text>
                          <Text className='index-execution-item__desc'>{item.explanation}</Text>
                          <Text className='index-execution-item__meta'>
                            时间：{new Date(item.createdAt).toLocaleString()}
                          </Text>
                        </View>
                      ))
                    : null}
                </View>
              </View>

              <View className='index-section'>
                <Text id='index-game-linkage-title' className='index-section__title'>
                  小游戏联动反馈
                </Text>
                <View className='index-game-card'>
                  <View className='index-game-summary-row'>
                    <Text className='index-game-summary-item'>可收集奖励：{gameSummary.collectibleCount}</Text>
                    <Text className='index-game-summary-item'>已解锁互动：{gameSummary.unlockedGameCount}</Text>
                  </View>
                  <Text className='index-game-summary-item'>最近互动：{gameSummary.touchpointCount}</Text>
                  {gameTouchpoints.length === 0 ? (
                    <Text className='index-game-empty'>暂未解锁小游戏互动，完成阶段触达后可获得联动反馈。</Text>
                  ) : (
                    gameTouchpoints.map((item) => (
                      <View key={item.touchpointId} className='index-game-touchpoint'>
                        <Text className='index-game-touchpoint__title'>{item.title}</Text>
                        <Text className='index-game-touchpoint__desc'>{item.desc}</Text>
                        {item.rewardLabel ? (
                          <Text className='index-game-touchpoint__meta'>奖励：{item.rewardLabel}</Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              </View>

              <ActivityArea activities={snapshot.activities} />

              {lastReceipt ? (
                <View className='index-receipt'>
                  <Text className='index-receipt__text'>{lastReceipt}</Text>
                </View>
              ) : null}
            </>
          ) : null}

          <View className='index-footer-space' />
        </View>
      </ScrollView>

      <CustomerBottomDock
        quote={quote}
        onPay={handlePay}
        disabled={paying}
        payButtonId='index-pay-button'
      />
    </View>
  );
}
