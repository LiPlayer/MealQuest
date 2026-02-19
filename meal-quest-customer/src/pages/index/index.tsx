import React, { useState } from 'react';
import { View, Text, Block, Slot } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';

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

    useLoad(async () => {
        console.log('Page loaded.');
        const storeId = storage.getLastStoreId();
        if (storeId) {
            const data = await MockDataService.getStoreById(storeId);
            setStoreData(data);
        } else {
            // Fallback or redirect if reached without storeId (shouldn't happen with correct flow)
            const defaultData = await MockDataService.getStoreById('store_a');
            setStoreData(defaultData);
        }
    });

    return (
        <View className='index-container'>
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
