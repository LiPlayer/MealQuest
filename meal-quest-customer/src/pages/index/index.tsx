import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';

import ActivityArea from '@/components/ActivityArea';
import CustomerBottomDock from '@/components/CustomerBottomDock';
import CustomerCardStack from '@/components/CustomerCardStack';
import ShopBrand from '@/components/ShopBrand';
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
