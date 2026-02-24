import { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { storage } from '../../utils/storage';
import { ApiDataService } from '../../services/ApiDataService';
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

    const validateMerchantId = async (storeId: string) => {
        if (!storeId) {
            return false;
        }
        if (!ApiDataService.isConfigured()) {
            Taro.showToast({ title: 'Service not configured', icon: 'none' });
            return false;
        }
        try {
            const ok = await ApiDataService.isMerchantAvailable(storeId);
            if (!ok) {
                Taro.showToast({ title: 'Store not found', icon: 'none' });
            }
            return ok;
        } catch (error) {
            console.warn('[Startup] merchant validation failed', error);
            Taro.showToast({ title: 'Store validation failed', icon: 'none' });
            return false;
        }
    };

    const enterStoreIfValid = async (candidate: string) => {
        const storeId = resolveStoreIdFromScan(candidate);
        if (!storeId) {
            return false;
        }
        const ok = await validateMerchantId(storeId);
        if (!ok) {
            return false;
        }
        storage.setLastStoreId(storeId);
        redirectToHome();
        return true;
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
        let active = true;

        const handleStartup = async () => {
            console.log('Startup [useEffect] firing...');
            const options = router.params;
            console.log('Startup options:', options);
            const entryCandidate =
                options.id ||
                options.storeId ||
                options.merchantId ||
                options.scene ||
                '';

            if (entryCandidate) {
                console.log('Found storeId in options:', entryCandidate);
                const entered = await enterStoreIfValid(entryCandidate);
                if (!entered && active) {
                    setIsNewUser(true);
                }
                return;
            }

            const lastId = storage.getLastStoreId();
            console.log('Checking storage for lastId:', lastId);
            if (lastId) {
                const entered = await enterStoreIfValid(lastId);
                if (entered) {
                    return;
                }
                storage.removeLastStoreId();
            }

            if (active) {
                console.log('No storeId found, setting isNewUser=true');
                setIsNewUser(true);
            }
        };

        handleStartup().catch((error) => {
            console.warn('[Startup] handleStartup failed', error);
            if (active) {
                setIsNewUser(true);
            }
        });

        return () => {
            active = false;
        };
    }, [router.params]);

    const handleScanQR = () => {
        Taro.scanCode({
            success: async (res) => {
                const entered = await enterStoreIfValid(String(res.result || ''));
                if (entered) {
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
