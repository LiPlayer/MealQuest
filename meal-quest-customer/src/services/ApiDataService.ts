import Taro from '@tarojs/taro';

import { CheckoutQuote } from '@/domain/smartCheckout';
import { storage } from '@/utils/storage';

import { HomeSnapshot, StoreData } from './MockDataService';

interface RequestOptions {
    method: 'GET' | 'POST';
    path: string;
    data?: Record<string, any>;
    token?: string;
}

const DEFAULT_THEME = {
    primaryColor: '#FFB100',
    secondaryColor: '#FFF8E1',
    backgroundColor: '#FAFAFA'
};

const DEFAULT_ACTIVITIES = [
    {
        id: 'remote_rainy',
        title: '雨天热汤补给',
        desc: '服务端策略触发，实时下发口福红包',
        icon: '🌧️',
        color: 'bg-blue-50',
        textColor: 'text-blue-600',
        tag: 'TCA'
    },
    {
        id: 'remote_recharge',
        title: '聚宝金库限时礼',
        desc: '充值立享赠送金，支持智能抵扣',
        icon: '💰',
        color: 'bg-amber-50',
        textColor: 'text-amber-600',
        tag: 'HOT'
    }
];

const getEnv = (name: string): string => {
    if (typeof process === 'undefined' || !process.env) {
        return '';
    }
    const value = process.env[name];
    return typeof value === 'string' ? value : '';
};

const getServerBaseUrl = () => getEnv('TARO_APP_SERVER_BASE_URL').trim();

const requestJson = async ({ method, path, data, token }: RequestOptions) => {
    const baseUrl = getServerBaseUrl();
    if (!baseUrl) {
        throw new Error('Missing TARO_APP_SERVER_BASE_URL');
    }

    const response = await Taro.request({
        method,
        url: `${baseUrl}${path}`,
        data,
        header: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    });

    if (response.statusCode >= 400) {
        const error = (response.data as any)?.error || `HTTP ${response.statusCode}`;
        throw new Error(error);
    }

    return response.data as any;
};

const ensureCustomerToken = async (merchantId: string, userId: string) => {
    const cached = storage.getApiToken();
    if (cached) {
        return cached;
    }

    const login = await requestJson({
        method: 'POST',
        path: '/api/auth/mock-login',
        data: {
            role: 'CUSTOMER',
            merchantId,
            userId
        }
    });

    storage.setApiToken(login.token);
    return login.token as string;
};

const toStoreData = (merchant: any): StoreData => ({
    id: merchant.merchantId,
    name: merchant.name,
    branchName: '默认门店',
    slogan: '支付不是结束，而是资产关系的开始',
    logo: 'https://api.dicebear.com/9.x/icons/svg?seed=MealQuest',
    theme: DEFAULT_THEME,
    isOpen: true
});

const toHomeSnapshot = (stateData: any): HomeSnapshot => ({
    store: toStoreData(stateData.merchant),
    wallet: {
        principal: Number(stateData.user.wallet.principal || 0),
        bonus: Number(stateData.user.wallet.bonus || 0),
        silver: Number(stateData.user.wallet.silver || 0)
    },
    fragments: {
        common: Number(stateData.user.fragments?.noodle || 0),
        rare: Number(stateData.user.fragments?.spicy || 0)
    },
    vouchers: (stateData.user.vouchers || []).map((voucher: any) => ({
        id: voucher.id,
        name: voucher.name,
        value: Number(voucher.value || 0),
        minSpend: Number(voucher.minSpend || 0),
        status: voucher.status,
        expiresAt: voucher.expiresAt
    })),
    activities: DEFAULT_ACTIVITIES
});

export const ApiDataService = {
    isConfigured: () => Boolean(getServerBaseUrl()),

    getHomeSnapshot: async (storeId: string, userId = 'u_demo'): Promise<HomeSnapshot> => {
        const token = await ensureCustomerToken(storeId, userId);
        const stateData = await requestJson({
            method: 'GET',
            path: `/api/state?merchantId=${encodeURIComponent(storeId)}&userId=${encodeURIComponent(userId)}`,
            token
        });
        return toHomeSnapshot(stateData);
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = 'u_demo'): Promise<CheckoutQuote> => {
        const token = await ensureCustomerToken(storeId, userId);
        return requestJson({
            method: 'POST',
            path: '/api/payment/quote',
            token,
            data: {
                merchantId: storeId,
                userId,
                orderAmount
            }
        });
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = 'u_demo'
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        const token = await ensureCustomerToken(storeId, userId);
        const quote = await requestJson({
            method: 'POST',
            path: '/api/payment/verify',
            token,
            data: {
                merchantId: storeId,
                userId,
                orderAmount,
                idempotencyKey: `mini_${Date.now()}`
            }
        });

        const snapshot = await ApiDataService.getHomeSnapshot(storeId, userId);
        return {
            paymentId: quote.paymentTxnId,
            quote: quote.quote,
            snapshot
        };
    }
};
