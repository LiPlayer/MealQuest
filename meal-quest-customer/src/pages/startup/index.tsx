import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { storage } from '../../utils/storage';
import './index.scss';

export default function Startup() {
    const [isNewUser, setIsNewUser] = useState(false);

    const redirectToHome = () => {
        Taro.nextTick(() => {
            Taro.reLaunch({
                url: '/pages/index/index'
            });
        });
    };

    useLoad((options) => {
        console.log('Startup useLoad fired with options:', options);
        const storeId = options.id || options.scene; // Handle normal param or scene value from QR

        if (storeId) {
            console.log('Found storeId in options:', storeId);
            // 1. URL/QR param priority: Load the store directly
            storage.setLastStoreId(storeId);
            redirectToHome();
        } else {
            // 2. Check storage for last visited store
            const lastId = storage.getLastStoreId();
            console.log('Checking storage for lastId:', lastId);
            if (lastId) {
                console.log('Redirecting to home with lastId...');
                redirectToHome();
            } else {
                // 3. True new user: Show QR scan UI
                console.log('No storeId found, setting isNewUser=true');
                setIsNewUser(true);
            }
        }
    });

    const handleScanQR = () => {
        Taro.scanCode({
            success: (res) => {
                // Assume the QR code contains the store ID or a URL with it
                // For simplicity in this mock, we just look for something that looks like an ID
                const result = res.result;
                // In a real app, you'd parse this URL
                if (result) {
                    storage.setLastStoreId(result);
                    redirectToHome();
                }
            }
        });
    };

    if (!isNewUser) {
        return (
            <View className='startup-loading'>
                <View className='loading-spinner' />
                <Text className='loading-text'>正在进入商户专属空间...</Text>
            </View>
        );
    }

    return (
        <View className='startup-container'>
            <View className='startup-content'>
                <View className='logo-placeholder'>
                    <View className='logo-inner' />
                </View>
                <Text className='startup-title'>欢迎使用</Text>
                <Text className='startup-description'>
                    请扫描桌角或商家二维码，解锁专属美味
                </Text>
                <View
                    className='scan-button transition-transform'
                    onClick={handleScanQR}
                >
                    <Text className='scan-button-text'>扫一扫</Text>
                </View>
            </View>

            <View className='startup-footer'>
                <Text className='footer-text'>MealQuest 私域专属技术支持</Text>
            </View>
        </View>
    );
}
