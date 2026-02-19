import React, { useState } from 'react';
import { View, Text, Block, Slot } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';

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

    useLoad(async () => {
        console.log('Page loaded.');
        const storeId = storage.getLastStoreId();
        if (storeId) {
            const data = await MockDataService.getStoreById(storeId);
            setStoreData(data);
        } else {
            const defaultData = await MockDataService.getStoreById('store_a');
            setStoreData(defaultData);
        }

        // Calculate dynamic header alignment
        try {
            const capsule = Taro.getMenuButtonBoundingClientRect();
            setHeaderStyle({
                '--header-height': `${capsule.bottom + 8}px`,
                '--nav-top': `${capsule.top}px`,
                '--nav-height': `${capsule.height}px`
            } as React.CSSProperties);
        } catch (e) {
            // Safe fallbacks for dev/unsupported environments
            setHeaderStyle({
                '--header-height': '88px',
                '--nav-top': '44px',
                '--nav-height': '32px'
            } as React.CSSProperties);
        }
    });

    return (
        <View className='index-container' style={headerStyle}>
            {/* @ts-ignore */}
            <wxs-scroll-view>
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
                {/* Note: The wrapper .shop-brand-scroll-wrapper is now in the native component */}
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
