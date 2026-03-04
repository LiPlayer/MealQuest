import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';

import { buildSmartCheckoutQuote } from '@/domain/smartCheckout';
import { HomeSnapshot } from '@/services/dataTypes';
import { DataService } from '@/services/DataService';
import { storage } from '@/utils/storage';

import './index.scss';

const DEFAULT_STORE_ID =
  (typeof process !== 'undefined' && process.env && process.env.TARO_APP_DEFAULT_STORE_ID) || '';
const DEFAULT_ORDER_AMOUNT = 52;

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

function toCount(value: number): string {
  return `${Math.max(0, Math.floor(Number(value || 0)))}`;
}

export default function IndexPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastReceipt, setLastReceipt] = useState('');
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
    } catch (error) {
      console.error('[Index] load snapshot failed', error);
      setErrorMessage('加载失败，请稍后重试');
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [storeId]);

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
      setLastReceipt(`支付成功：${result.paymentId}`);
      Taro.showToast({ title: '支付成功', icon: 'none' });
    } catch (error) {
      console.error('[Index] execute checkout failed', error);
      Taro.showToast({ title: '支付失败，请重试', icon: 'none' });
    } finally {
      setPaying(false);
    }
  }, [orderAmount, paying, snapshot, storeId]);

  const vouchers = snapshot?.vouchers || [];
  const activities = snapshot?.activities || [];

  return (
    <View className='index-page'>
      <View className='index-header'>
        <View className='index-header__store'>
          <Text className='index-header__name'>{snapshot?.store.name || 'MealQuest'}</Text>
          <Text className='index-header__id'>{storeId || '未识别门店'}</Text>
        </View>
        <View id='index-account-entry' className='index-header__account' onClick={handleOpenAccount}>
          <Text className='index-header__account-text'>账户中心</Text>
        </View>
      </View>

      <ScrollView scrollY className='index-scroll'>
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
          <View className='index-content'>
            <View className='index-card'>
              <Text className='index-card__title'>我的资产</Text>
              <View className='index-grid'>
                <View className='index-grid__item'>
                  <Text className='index-grid__label'>本金</Text>
                  <Text className='index-grid__value'>{toMoney(snapshot.wallet.principal)}</Text>
                </View>
                <View className='index-grid__item'>
                  <Text className='index-grid__label'>赠送金</Text>
                  <Text className='index-grid__value'>{toMoney(snapshot.wallet.bonus)}</Text>
                </View>
                <View className='index-grid__item'>
                  <Text className='index-grid__label'>碎银</Text>
                  <Text className='index-grid__value'>{toCount(snapshot.wallet.silver)} 两</Text>
                </View>
                <View className='index-grid__item'>
                  <Text className='index-grid__label'>碎片</Text>
                  <Text className='index-grid__value'>
                    普通 {toCount(snapshot.fragments.common)} / 稀有 {toCount(snapshot.fragments.rare)}
                  </Text>
                </View>
              </View>
            </View>

            <View className='index-card'>
              <Text className='index-card__title'>可用权益</Text>
              {vouchers.length === 0 ? (
                <Text className='index-empty'>暂无可用券</Text>
              ) : (
                vouchers.map((voucher) => (
                  <View key={voucher.id} className='index-row'>
                    <View>
                      <Text className='index-row__title'>{voucher.name}</Text>
                      <Text className='index-row__meta'>满 {toMoney(voucher.minSpend)} 可用</Text>
                    </View>
                    <Text className='index-row__value'>{toMoney(voucher.value)}</Text>
                  </View>
                ))
              )}
            </View>

            <View className='index-card'>
              <Text className='index-card__title'>今日活动</Text>
              {activities.length === 0 ? (
                <Text className='index-empty'>暂无活动</Text>
              ) : (
                activities.map((activity) => (
                  <View key={activity.id} className='index-row'>
                    <View>
                      <Text className='index-row__title'>{activity.title}</Text>
                      <Text className='index-row__meta'>{activity.desc}</Text>
                    </View>
                    <Text className='index-row__tag'>{activity.tag}</Text>
                  </View>
                ))
              )}
            </View>

            {lastReceipt ? (
              <View className='index-receipt'>
                <Text className='index-receipt__text'>{lastReceipt}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View className='index-dock'>
        <View>
          <Text className='index-dock__amount'>订单金额：{toMoney(orderAmount)}</Text>
          <Text className='index-dock__payable'>
            待外部支付：{toMoney(quote ? quote.payable : orderAmount)}
          </Text>
        </View>
        <View id='index-pay-button' className='index-dock__button' onClick={handlePay}>
          <Text className='index-dock__button-text'>{paying ? '支付中...' : '确认支付'}</Text>
        </View>
      </View>
    </View>
  );
}
