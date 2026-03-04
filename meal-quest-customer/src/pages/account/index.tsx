import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';

import { DataService } from '@/services/DataService';
import { HomeSnapshot, InvoiceItem, PaymentLedgerItem } from '@/services/dataTypes';
import { storage } from '@/utils/storage';

import './index.scss';

const DEFAULT_STORE_ID =
  (typeof process !== 'undefined' && process.env && process.env.TARO_APP_DEFAULT_STORE_ID) || '';

const toMoney = (value: number) => `¥${Number(value || 0).toFixed(2)}`;

export default function AccountPage() {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [ledger, setLedger] = useState<PaymentLedgerItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [cancelArmed, setCancelArmed] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [customerUserId, setCustomerUserId] = useState('');

  const storeId = useMemo(() => {
    return String(storage.getLastStoreId() || DEFAULT_STORE_ID || '').trim();
  }, []);

  const resolveUserId = useCallback(() => {
    return String(storage.getCustomerUserId() || '').trim();
  }, []);

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
    } catch (error) {
      console.error('[Account] load data failed', error);
      setErrorMessage('加载失败，请重试');
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [resolveUserId, storeId]);

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
