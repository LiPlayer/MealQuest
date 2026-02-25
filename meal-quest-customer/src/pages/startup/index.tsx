import { useState, useEffect, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { storage } from '../../utils/storage';
import { ApiDataService } from '../../services/ApiDataService';
import './index.scss';

interface StartupIntent {
    storeId: string;
    autoPay: boolean;
    orderAmount: number | null;
}

function decodeSafe(raw: string) {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function isValidMerchantId(value: string) {
    return /^[a-zA-Z0-9_-]{2,64}$/.test(value);
}

function parseOrderAmount(raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return Math.round(parsed * 100) / 100;
}

function isPayFlag(raw: string) {
    const normalized = String(raw || '').trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    return ['1', 'true', 'yes', 'on', 'pay', 'payment'].includes(normalized);
}

function applyRawIntent(intent: StartupIntent, rawInput: string) {
    const raw = String(rawInput || '').trim();
    if (!raw) {
        return;
    }
    const decoded = decodeSafe(raw);

    if (!intent.storeId && isValidMerchantId(decoded)) {
        intent.storeId = decoded;
        return;
    }

    const applyKeyValue = (keyInput: string, valueInput: string) => {
        const key = String(keyInput || '').trim().toLowerCase();
        const value = decodeSafe(String(valueInput || '').trim());
        if (!key) {
            return;
        }

        if (key === 'id' || key === 'storeid' || key === 'merchantid') {
            if (!intent.storeId && isValidMerchantId(value)) {
                intent.storeId = value;
            }
            return;
        }

        if (key === 'scene') {
            applyRawIntent(intent, value);
            return;
        }

        if (key === 'pay' || key === 'autopay' || key === 'openpay') {
            if (isPayFlag(value)) {
                intent.autoPay = true;
            }
            return;
        }

        if (key === 'action' || key === 'page') {
            if (String(value || '').toLowerCase().includes('pay')) {
                intent.autoPay = true;
            }
            return;
        }

        if (key === 'amount' || key === 'orderamount' || key === 'payamount') {
            const amount = parseOrderAmount(value);
            if (amount !== null) {
                intent.orderAmount = amount;
            }
        }
    };

    try {
        const parsed = new URL(decoded);
        parsed.searchParams.forEach((value, key) => applyKeyValue(key, value));
        const tailSegment = decodeSafe(parsed.pathname.split('/').filter(Boolean).pop() || '');
        if (!intent.storeId && isValidMerchantId(tailSegment)) {
            intent.storeId = tailSegment;
        }
        return;
    } catch {
        // Not an absolute URL, continue parsing as query-like text.
    }

    if (decoded.includes('?') || decoded.includes('=') || decoded.includes('&')) {
        const queryPart = decoded.includes('?') ? decoded.split('?').slice(1).join('?') : decoded;
        const params = new URLSearchParams(queryPart);
        params.forEach((value, key) => applyKeyValue(key, value));
    }

    const tailSegment = decoded.match(/\/([a-zA-Z0-9_-]{2,64})$/);
    if (!intent.storeId && tailSegment && tailSegment[1]) {
        intent.storeId = tailSegment[1];
    }
}

function resolveStartupIntent(input: string, options: Record<string, any> = {}): StartupIntent {
    const intent: StartupIntent = {
        storeId: '',
        autoPay: false,
        orderAmount: null
    };

    applyRawIntent(intent, input);

    const candidateKeys = [
        'id',
        'storeId',
        'merchantId',
        'scene',
        'action',
        'page',
        'pay',
        'autoPay',
        'openPay',
        'amount',
        'orderAmount',
        'payAmount'
    ];
    for (const key of candidateKeys) {
        const value = options[key];
        if (value !== undefined && value !== null && value !== '') {
            applyRawIntent(intent, `${key}=${String(value)}`);
        }
    }

    return intent;
}

export default function Startup() {
    const [isNewUser, setIsNewUser] = useState(false);

    const validateMerchantId = useCallback(async (storeId: string) => {
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
    }, []);

    const redirectToHome = useCallback((intent?: { autoPay?: boolean; orderAmount?: number | null }) => {
        let targetUrl = '/pages/index/index';
        const query: string[] = [];

        if (intent && intent.autoPay) {
            query.push('autoPay=1');
            if (intent.orderAmount !== null && intent.orderAmount !== undefined) {
                query.push(`orderAmount=${encodeURIComponent(String(intent.orderAmount))}`);
            }
        }

        if (query.length > 0) {
            targetUrl += `?${query.join('&')}`;
        }

        Taro.nextTick(() => {
            Taro.reLaunch({
                url: targetUrl
            });
        });
    }, []);

    const enterStoreIfValid = useCallback(async (intent: StartupIntent) => {
        if (!intent.storeId) {
            return false;
        }
        const ok = await validateMerchantId(intent.storeId);
        if (!ok) {
            return false;
        }
        storage.setLastStoreId(intent.storeId);
        redirectToHome(intent);
        return true;
    }, [redirectToHome, validateMerchantId]);

    const router = useRouter();

    useEffect(() => {
        let active = true;

        const handleStartup = async () => {
            const options = (router.params || {}) as Record<string, any>;
            const entryCandidate =
                options.id ||
                options.storeId ||
                options.merchantId ||
                options.scene ||
                '';

            if (entryCandidate) {
                const intent = resolveStartupIntent(String(entryCandidate || ''), options);
                const entered = await enterStoreIfValid(intent);
                if (!entered && active) {
                    setIsNewUser(true);
                }
                return;
            }

            const lastId = storage.getLastStoreId();
            if (lastId) {
                const entered = await enterStoreIfValid(resolveStartupIntent(String(lastId || '')));
                if (entered) {
                    return;
                }
                storage.removeLastStoreId();
            }

            if (active) {
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
    }, [enterStoreIfValid, router.params]);

    const handleScanQR = () => {
        Taro.scanCode({
            success: async (res) => {
                const intent = resolveStartupIntent(String(res.result || ''));
                const entered = await enterStoreIfValid(intent);
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
