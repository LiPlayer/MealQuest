import React, { useState, useEffect } from 'react';
import { View, Text, Slot } from '@tarojs/components';
import Taro, { useReady } from '@tarojs/taro';

import ShopBrand from '../../components/ShopBrand';
import CustomerCardStack from '../../components/CustomerCardStack';
import ActivityArea from '../../components/ActivityArea';
import CustomerBottomDock from '../../components/CustomerBottomDock';
import { storage } from '../../utils/storage';
import { MockDataService, StoreData } from '../../services/MockDataService';

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
    const [storeData, setStoreData] = useState<StoreData | null>(null);
    const [headerStyle, setHeaderStyle] = useState<React.CSSProperties>({});
    const [refreshTrigger, setRefreshTrigger] = useState(0);

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
                    const data = await MockDataService.getStoreById(storeId);
                    console.log('Fetched data [Success]:', data);
                    setStoreData(data);
                    setRefreshTrigger(v => v + 1);
                } catch (err) {
                    console.error('Error fetching store data:', err);
                }
            } else {
                console.log('Using default store_a');
                const defaultData = await MockDataService.getStoreById('store_a');
                setStoreData(defaultData);
                setRefreshTrigger(v => v + 1);
            }
        };

        loadData();
    }, []);

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
                        {storeData?.name || 'Loading...'}
                    </Text>
                </Slot>

                {/* ── Brand Slot ── */}
                <Slot name="brand">
                    <ShopBrand
                        name={storeData?.name}
                        branchName={storeData?.branchName}
                        slogan={storeData?.slogan}
                        logo={storeData?.logo}
                        isOpen={storeData?.isOpen}
                    />
                </Slot>

                {/* ── Card Stack Slot ── */}
                <Slot name="cards">
                    <CustomerCardStack />
                </Slot>

                {/* ── Activity Area Slot ── */}
                <Slot name="activity">
                    <ActivityArea />
                </Slot>
            </wxs-scroll-view>

            {/* 底部水晶支付坞 */}
            <CustomerBottomDock />
        </View >
    );
}
