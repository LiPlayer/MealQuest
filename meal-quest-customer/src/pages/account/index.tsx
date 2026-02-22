import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';

import { DataService } from '@/services/DataService';
import { HomeSnapshot, InvoiceItem, PaymentLedgerItem } from '@/services/MockDataService';
import { storage } from '@/utils/storage';

import './index.scss';

const DEFAULT_USER_ID = 'u_demo';
const DEFAULT_STORE_ID =
    (typeof process !== 'undefined' && process.env && process.env.TARO_APP_DEFAULT_STORE_ID) || 'store_a';

const toMoney = (value: number) => `¥${Number(value || 0).toFixed(2)}`;

export default function AccountPage() {
    const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
    const [ledger, setLedger] = useState<PaymentLedgerItem[]>([]);
    const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelArmed, setCancelArmed] = useState(false);
    const [canceling, setCanceling] = useState(false);

    const storeId = useMemo(() => storage.getLastStoreId() || DEFAULT_STORE_ID, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [nextSnapshot, nextLedger, nextInvoices] = await Promise.all([
                DataService.getHomeSnapshot(storeId, DEFAULT_USER_ID),
                DataService.getPaymentLedger(storeId, DEFAULT_USER_ID, 20),
                DataService.getInvoices(storeId, DEFAULT_USER_ID, 20)
            ]);
            setSnapshot(nextSnapshot);
            setLedger(nextLedger);
            setInvoices(nextInvoices);
        } catch (error) {
            console.error('Account page load failed:', error);
            Taro.showToast({ title: '加载失败，请重试', icon: 'none' });
        } finally {
            setLoading(false);
        }
    }, [storeId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleCancelAccount = async () => {
        if (canceling) {
            return;
        }
        if (!cancelArmed) {
            setCancelArmed(true);
            Taro.showToast({ title: '再次点击确认注销', icon: 'none' });
            return;
        }

        setCanceling(true);
        try {
            await DataService.cancelAccount(storeId, DEFAULT_USER_ID);
            storage.clearCustomerSession(storeId, DEFAULT_USER_ID);
            Taro.showToast({ title: '账号已注销', icon: 'none' });
            Taro.reLaunch({ url: '/pages/startup/index' });
        } catch (error) {
            console.error('Cancel account failed:', error);
            Taro.showToast({ title: '注销失败，请稍后重试', icon: 'none' });
        } finally {
            setCancelArmed(false);
            setCanceling(false);
        }
    };

    return (
        <View className='account-page'>
            <View className='account-page__header'>
                <Text id='account-page-title' className='account-page__title'>账户中心</Text>
                <Text className='account-page__subtitle'>
                    {snapshot?.store.name || 'MealQuest'} · {storeId}
                </Text>
            </View>

            <View className='account-card'>
                <Text className='account-card__title'>钱包资产</Text>
                <View className='account-wallet'>
                    <Text>本金：{toMoney(snapshot?.wallet.principal || 0)}</Text>
                    <Text>赠送金：{toMoney(snapshot?.wallet.bonus || 0)}</Text>
                    <Text>碎银：{Number(snapshot?.wallet.silver || 0).toFixed(0)} 两</Text>
                </View>
            </View>

            <View className='account-actions'>
                <Button id='account-refresh-button' className='account-btn account-btn--ghost' onClick={loadData} disabled={loading}>
                    刷新
                </Button>
                <Button
                    id='account-cancel-button'
                    className='account-btn account-btn--danger'
                    onClick={handleCancelAccount}
                    disabled={canceling}
                >
                    {cancelArmed ? '确认注销' : '注销账号'}
                </Button>
            </View>

            <View className='account-card'>
                <Text id='account-ledger-title' className='account-card__title'>支付流水</Text>
                {ledger.length === 0 && <Text className='account-empty'>暂无流水</Text>}
                {ledger.map((item) => (
                    <View className='account-row' key={item.txnId}>
                        <Text>{item.type}</Text>
                        <Text>{toMoney(item.amount)}</Text>
                        <Text className='account-row__meta'>{new Date(item.timestamp).toLocaleString()}</Text>
                    </View>
                ))}
            </View>

            <View className='account-card'>
                <Text id='account-invoice-title' className='account-card__title'>电子发票</Text>
                {invoices.length === 0 && <Text className='account-empty'>暂无发票</Text>}
                {invoices.map((invoice) => (
                    <View className='account-row' key={invoice.invoiceNo}>
                        <Text>{invoice.invoiceNo}</Text>
                        <Text>{toMoney(invoice.amount)}</Text>
                        <Text className='account-row__meta'>{invoice.status}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
