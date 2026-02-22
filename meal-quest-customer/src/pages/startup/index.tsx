import { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { storage } from '../../utils/storage';
import './index.scss';

export default function Startup() {
    const [isNewUser, setIsNewUser] = useState(false);

    const resolveStoreIdFromScan = (rawResult: string) => {
        const raw = String(rawResult || '').trim();
        if (!raw) {
            return '';
        }

        const direct = raw.match(/^[a-zA-Z0-9_-]{2,64}$/);
        if (direct) {
            return direct[0];
        }

        const decoded = (() => {
            try {
                return decodeURIComponent(raw);
            } catch {
                return raw;
            }
        })();

        const queryMatch = decoded.match(/[?&](?:id|storeId|merchantId|scene)=([^&#]+)/i);
        if (queryMatch && queryMatch[1]) {
            return queryMatch[1].trim();
        }

        const tailSegment = decoded.match(/\/([a-zA-Z0-9_-]{2,64})$/);
        if (tailSegment && tailSegment[1]) {
            return tailSegment[1];
        }

        return '';
    };

    const redirectToHome = () => {
        Taro.nextTick(() => {
            Taro.reLaunch({
                url: '/pages/index/index'
            });
        });
    };

    const router = useRouter();

    useEffect(() => {
        const handleStartup = () => {
            console.log('Startup [useEffect] firing...');
            const options = router.params;
            console.log('Startup options:', options);
            const storeId = options.id || options.scene;

            if (storeId) {
                console.log('Found storeId in options:', storeId);
                storage.setLastStoreId(storeId);
                redirectToHome();
            } else {
                const lastId = storage.getLastStoreId();
                console.log('Checking storage for lastId:', lastId);
                if (lastId) {
                    console.log('Redirecting to home with lastId...');
                    redirectToHome();
                } else {
                    console.log('No storeId found, setting isNewUser=true');
                    setIsNewUser(true);
                }
            }
        };

        handleStartup();
    }, [router.params]);

    const handleScanQR = () => {
        Taro.scanCode({
            success: (res) => {
                const storeId = resolveStoreIdFromScan(res.result);
                if (storeId) {
                    storage.setLastStoreId(storeId);
                    redirectToHome();
                    return;
                }
                Taro.showToast({ title: '二维码无效，请重试', icon: 'none' });
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
                    id='startup-scan-button'
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
