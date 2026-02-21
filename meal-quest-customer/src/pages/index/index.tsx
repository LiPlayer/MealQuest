import React, { useState, useEffect } from 'react';
import { View, Text, Slot } from '@tarojs/components';
import Taro, { useReady } from '@tarojs/taro';

import ShopBrand from '../../components/ShopBrand';
import CustomerCardStack from '../../components/CustomerCardStack';
import ActivityArea from '../../components/ActivityArea';
import CustomerBottomDock from '../../components/CustomerBottomDock';
import { storage } from '../../utils/storage';
import { MockDataService, HomeSnapshot } from '../../services/MockDataService';
import { buildSmartCheckoutQuote } from '../../domain/smartCheckout';

import './index.scss';

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
    const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
    const [headerStyle, setHeaderStyle] = useState<React.CSSProperties>({});
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isPaying, setIsPaying] = useState(false);
    const [lastReceipt, setLastReceipt] = useState<string>('');

    const orderAmount = 52;
    const quote = snapshot
        ? buildSmartCheckoutQuote(orderAmount, snapshot.wallet, snapshot.vouchers)
        : null;

    useReady(() => {
        console.log('Index [useReady] fired.');

        // Calculate dynamic header alignment
        try {
            const capsule = Taro.getMenuButtonBoundingClientRect();
            console.log('Capsule data [Ready]:', capsule);
            setHeaderStyle({
                '--header-height': `${capsule.bottom + 8}px`,
                '--nav-top': `${capsule.top}px`,
                '--nav-height': `${capsule.height}px`
            } as React.CSSProperties);
        } catch (e) {
            console.warn('Failed to get capsule rect, using fallbacks:', e);
            setHeaderStyle({
                '--header-height': '88px',
                '--nav-top': '44px',
                '--nav-height': '32px'
            } as React.CSSProperties);
        }
    });

    useEffect(() => {
        const loadData = async () => {
            console.log('Index [useEffect] loading data...');
            const storeId = storage.getLastStoreId();
            console.log('Index target storeId:', storeId);

            if (storeId) {
                try {
                    const homeSnapshot = await MockDataService.getHomeSnapshot(storeId);
                    console.log('Fetched snapshot [Success]:', homeSnapshot);
                    setSnapshot(homeSnapshot);
                    setRefreshTrigger(v => v + 1);
                } catch (err) {
                    console.error('Error fetching store data:', err);
                }
            } else {
                console.log('Using default store_a');
                const defaultSnapshot = await MockDataService.getHomeSnapshot('store_a');
                setSnapshot(defaultSnapshot);
                setRefreshTrigger(v => v + 1);
            }
        };

        loadData();
    }, []);

    const handleCheckout = async () => {
        if (!snapshot || isPaying) {
            return;
        }
        setIsPaying(true);
        try {
            const result = await MockDataService.executeCheckout(snapshot.store.id, orderAmount);
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

    return (
        <View className='index-container' style={headerStyle}>
            {/* @ts-ignore */}
            <wxs-scroll-view refresh-trigger={refreshTrigger}>
                {/* ── Header Slots ── */}
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

                {/* ── Brand Slot ── */}
                <Slot name="brand">
                    <ShopBrand
                        name={snapshot?.store.name}
                        branchName={snapshot?.store.branchName}
                        slogan={snapshot?.store.slogan}
                        logo={snapshot?.store.logo}
                        isOpen={snapshot?.store.isOpen}
                    />
                </Slot>

                {/* ── Card Stack Slot ── */}
                <Slot name="cards">
                    <CustomerCardStack
                        wallet={snapshot?.wallet}
                        vouchers={snapshot?.vouchers}
                        fragments={snapshot?.fragments}
                    />
                </Slot>

                {/* ── Activity Area Slot ── */}
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

            {/* 底部水晶支付坞 */}
            <CustomerBottomDock quote={quote} onPay={handleCheckout} disabled={!snapshot || isPaying} />
        </View >
    );
}
