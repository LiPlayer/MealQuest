import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Slot } from '@tarojs/components';
import Taro, { useReady, useRouter } from '@tarojs/taro';

import ShopBrand from '../../components/ShopBrand';
import CustomerCardStack from '../../components/CustomerCardStack';
import ActivityArea from '../../components/ActivityArea';
import CustomerBottomDock from '../../components/CustomerBottomDock';
import { storage } from '../../utils/storage';
import { HomeSnapshot } from '../../services/dataTypes';
import { DataService } from '../../services/DataService';
import { buildSmartCheckoutQuote } from '../../domain/smartCheckout';

import './index.scss';

const DEFAULT_STORE_ID =
    (typeof process !== 'undefined' && process.env && process.env.TARO_APP_DEFAULT_STORE_ID) || '';

const DEFAULT_ORDER_AMOUNT = 52;

const toOrderAmount = (raw: unknown) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_ORDER_AMOUNT;
    }
    return Math.round(parsed * 100) / 100;
};

const isAutoPayEnabled = (raw: unknown) => {
    const normalized = String(raw || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'pay', 'payment'].includes(normalized);
};

// Add declaration for the native component
declare global {
    namespace JSX {
        interface IntrinsicElements {
            'wxs-scroll-view': any;
        }
        interface IntrinsicAttributes {
            slot?: string;
        }
    }
}

export default function Index() {
    const router = useRouter();
    const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
    const [headerStyle, setHeaderStyle] = useState<React.CSSProperties>({});
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isPaying, setIsPaying] = useState(false);
    const [lastReceipt, setLastReceipt] = useState<string>('');
    const autoPayHintShownRef = useRef(false);

    const orderAmount = useMemo(() => {
        const params = (router.params || {}) as Record<string, unknown>;
        const raw = params.orderAmount ?? params.amount;
        return toOrderAmount(raw);
    }, [router.params]);

    const shouldAutoPay = useMemo(() => {
        const params = (router.params || {}) as Record<string, unknown>;
        return isAutoPayEnabled(params.autoPay);
    }, [router.params]);

    const quote = snapshot
        ? buildSmartCheckoutQuote(orderAmount, snapshot.wallet, snapshot.vouchers)
        : null;

    useReady(() => {
        try {
            const capsule = Taro.getMenuButtonBoundingClientRect();
            setHeaderStyle({
                '--header-height': `${capsule.bottom + 8}px`,
                '--nav-top': `${capsule.top}px`,
                '--nav-height': `${capsule.height}px`
            } as React.CSSProperties);
        } catch {
            setHeaderStyle({
                '--header-height': '88px',
                '--nav-top': '44px',
                '--nav-height': '32px'
            } as React.CSSProperties);
        }
    });

    useEffect(() => {
        const loadData = async () => {
            const storeId = storage.getLastStoreId() || DEFAULT_STORE_ID;
            if (!storeId) {
                Taro.reLaunch({ url: '/pages/startup/index' });
                return;
            }

            try {
                const homeSnapshot = await DataService.getHomeSnapshot(storeId);
                setSnapshot(homeSnapshot);
                setRefreshTrigger(v => v + 1);
            } catch (err) {
                console.error('Error fetching store data:', err);
            }
        };

        loadData().catch(error => {
            console.error('Failed to load home snapshot:', error);
        });
    }, []);

    const handleCheckout = async (targetOrderAmount = orderAmount) => {
        if (!snapshot || isPaying) {
            return;
        }
        setIsPaying(true);
        try {
            const result = await DataService.executeCheckout(snapshot.store.id, targetOrderAmount);
            setSnapshot(result.snapshot);
            setLastReceipt(`支付成功 ${result.paymentId}，外部支付 ¥${result.quote.payable.toFixed(2)}`);
            setRefreshTrigger(v => v + 1);
        } catch (error) {
            console.error('Checkout failed:', error);
            Taro.showToast({ title: '支付失败，请重试', icon: 'none' });
        } finally {
            setIsPaying(false);
        }
    };

    useEffect(() => {
        if (!shouldAutoPay || autoPayHintShownRef.current || !snapshot) {
            return;
        }
        autoPayHintShownRef.current = true;
        Taro.showToast({ title: '已打开支付页，请确认支付', icon: 'none' });
    }, [shouldAutoPay, snapshot]);

    const handleOpenAccount = () => {
        Taro.navigateTo({ url: '/pages/account/index' });
    };

    return (
        <View className='index-container' style={headerStyle}>
            <View id='index-account-entry' className='account-entry' onClick={handleOpenAccount}>
                <Text className='account-entry__text'>账户中心</Text>
            </View>
            {/* @ts-ignore */}
            <wxs-scroll-view refresh-trigger={refreshTrigger}>
                <Slot name="header-left">
                    <View className="avatar-wrapper transition-transform">
                        <View className='avatar-circle'>
                            <Text className='avatar-emoji'>👤</Text>
                        </View>
                    </View>
                </Slot>

                <Slot name="header-title">
                    <Text className='header-store-name__text'>
                        {snapshot?.store.name || 'Loading...'}
                    </Text>
                </Slot>

                <Slot name="brand">
                    <ShopBrand
                        name={snapshot?.store.name}
                        branchName={snapshot?.store.branchName}
                        slogan={snapshot?.store.slogan}
                        logo={snapshot?.store.logo}
                        isOpen={snapshot?.store.isOpen}
                    />
                </Slot>

                <Slot name="cards">
                    <CustomerCardStack
                        wallet={snapshot?.wallet}
                        vouchers={snapshot?.vouchers}
                        fragments={snapshot?.fragments}
                    />
                </Slot>

                <Slot name="activity">
                    <ActivityArea activities={snapshot?.activities} />
                </Slot>
            </wxs-scroll-view>

            {lastReceipt && (
                <View style={{ position: 'absolute', left: '32rpx', right: '32rpx', bottom: '196rpx', zIndex: 90 }}>
                    <Text style={{ fontSize: '22rpx', color: '#1e293b', backgroundColor: 'rgba(241,245,249,0.95)', padding: '14rpx 18rpx', borderRadius: '20rpx' }}>
                        {lastReceipt}
                    </Text>
                </View>
            )}

            <CustomerBottomDock quote={quote} onPay={() => handleCheckout(orderAmount)} disabled={!snapshot || isPaying} />
        </View >
    );
}
