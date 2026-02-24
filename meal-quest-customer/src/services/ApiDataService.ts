import Taro from '@tarojs/taro';

import { CheckoutQuote } from '@/domain/smartCheckout';
import { storage } from '@/utils/storage';

import { HomeSnapshot, InvoiceItem, PaymentLedgerItem, StoreData } from './dataTypes';

interface RequestOptions {
    method: 'GET' | 'POST';
    path: string;
    data?: Record<string, any>;
    token?: string;
}

interface MerchantCatalogItem {
    merchantId: string;
}

interface CustomerWechatLoginResponse {
    token: string;
    profile?: {
        userId?: string;
        phone?: string;
    };
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

const getServerBaseUrl = () => {
    return getEnv('TARO_APP_SERVER_URL').trim();
};

const requestJson = async ({ method, path, data, token }: RequestOptions) => {
    const baseUrl = getServerBaseUrl();
    if (!baseUrl) {
        throw new Error('Missing TARO_APP_SERVER_URL');
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

const requestWeChatLoginCode = async () => {
    const loginResult = await Taro.login();
    const code = String((loginResult as any)?.code || '').trim();
    if (!code) {
        throw new Error('WeChat login code is missing');
    }
    return code;
};

const normalizeUserId = (input?: string) => String(input || '').trim();

const ensureCustomerSession = async (
    merchantId: string,
    requestedUserId = ''
): Promise<{ token: string; userId: string }> => {
    const normalizedMerchantId = String(merchantId || '').trim();
    if (!normalizedMerchantId) {
        throw new Error('merchantId is required');
    }

    const cachedToken = storage.getApiToken();
    const cachedUserId = normalizeUserId(storage.getCustomerUserId() || '');
    const cachedMerchantId = String(storage.getApiTokenMerchantId() || '').trim();
    if (cachedToken && cachedUserId && cachedMerchantId === normalizedMerchantId) {
        return { token: cachedToken, userId: cachedUserId };
    }

    const code = await requestWeChatLoginCode();
    const login = await requestJson({
        method: 'POST',
        path: '/api/auth/customer/wechat-login',
        data: {
            merchantId: normalizedMerchantId,
            code
        }
    });
    const typedLogin = login as CustomerWechatLoginResponse;
    const token = String(typedLogin?.token || '').trim();
    const serverUserId = normalizeUserId(typedLogin?.profile?.userId || '');
    const userId = serverUserId;

    if (!token || !userId) {
        throw new Error('customer login failed');
    }

    storage.setApiToken(token);
    storage.setApiTokenMerchantId(normalizedMerchantId);
    storage.setCustomerUserId(userId);
    return { token, userId };
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
    activities: Array.isArray(stateData.activities) && stateData.activities.length > 0
        ? stateData.activities.map((item: any) => ({
            id: item.id,
            title: item.title,
            desc: item.desc,
            icon: item.icon || '✨',
            color: item.color || 'bg-slate-50',
            textColor: item.textColor || 'text-slate-600',
            tag: item.tag || 'AI'
        }))
        : DEFAULT_ACTIVITIES
});

export const ApiDataService = {
    isConfigured: () => Boolean(getServerBaseUrl()),

    isMerchantAvailable: async (merchantId: string): Promise<boolean> => {
        const target = String(merchantId || '').trim();
        if (!target) {
            return false;
        }
        const catalog = await requestJson({
            method: 'GET',
            path: '/api/merchant/catalog'
        });
        const items = Array.isArray(catalog?.items)
            ? (catalog.items as MerchantCatalogItem[])
            : [];
        return items.some((item) => String(item?.merchantId || '').trim() === target);
    },

    getHomeSnapshot: async (storeId: string, userId = ''): Promise<HomeSnapshot> => {
        const targetStoreId = storeId || getEnv('TARO_APP_DEFAULT_STORE_ID') || 'm_store_001';
        const targetStoreIdStr = String(targetStoreId);
        const session = await ensureCustomerSession(targetStoreIdStr, userId);
        const stateData = await requestJson({
            method: 'GET',
            path: `/api/state?merchantId=${encodeURIComponent(targetStoreIdStr)}&userId=${encodeURIComponent(session.userId)}`,
            token: session.token
        });
        const snapshot = toHomeSnapshot(stateData);
        storage.setCachedHomeSnapshot(targetStoreIdStr, session.userId, snapshot);
        return snapshot;
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = ''): Promise<CheckoutQuote> => {
        const session = await ensureCustomerSession(storeId, userId);
        return requestJson({
            method: 'POST',
            path: '/api/payment/quote',
            token: session.token,
            data: {
                merchantId: storeId,
                userId: session.userId,
                orderAmount
            }
        });
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = ''
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        const session = await ensureCustomerSession(storeId, userId);
        const quote = await requestJson({
            method: 'POST',
            path: '/api/payment/verify',
            token: session.token,
            data: {
                merchantId: storeId,
                userId: session.userId,
                orderAmount,
                idempotencyKey: `mini_${Date.now()}`
            }
        });

        const snapshot = await ApiDataService.getHomeSnapshot(storeId, session.userId);
        storage.setCachedHomeSnapshot(storeId, session.userId, snapshot);
        return {
            paymentId: quote.paymentTxnId,
            quote: quote.quote,
            snapshot
        };
    },

    getPaymentLedger: async (
        storeId: string,
        userId = '',
        limit = 20
    ): Promise<PaymentLedgerItem[]> => {
        const session = await ensureCustomerSession(storeId, userId);
        const result = await requestJson({
            method: 'GET',
            path: `/api/payment/ledger?merchantId=${encodeURIComponent(storeId)}&userId=${encodeURIComponent(session.userId)}&limit=${encodeURIComponent(String(limit))}`,
            token: session.token
        });
        const items = Array.isArray(result.items) ? result.items : [];
        return items.map((item: any) => ({
            txnId: String(item.txnId || ''),
            merchantId: String(item.merchantId || storeId),
            userId: String(item.userId || session.userId),
            type: item.type || 'PAYMENT',
            amount: Number(item.amount || 0),
            timestamp: item.timestamp || new Date().toISOString(),
            paymentTxnId: item.details?.paymentTxnId || item.paymentTxnId
        }));
    },

    getInvoices: async (
        storeId: string,
        userId = '',
        limit = 20
    ): Promise<InvoiceItem[]> => {
        const session = await ensureCustomerSession(storeId, userId);
        const result = await requestJson({
            method: 'GET',
            path: `/api/invoice/list?merchantId=${encodeURIComponent(storeId)}&userId=${encodeURIComponent(session.userId)}&limit=${encodeURIComponent(String(limit))}`,
            token: session.token
        });
        const items = Array.isArray(result.items) ? result.items : [];
        return items.map((item: any) => ({
            invoiceNo: String(item.invoiceNo || ''),
            merchantId: String(item.merchantId || storeId),
            userId: String(item.userId || session.userId),
            paymentTxnId: String(item.paymentTxnId || ''),
            amount: Number(item.amount || 0),
            status: String(item.status || 'ISSUED'),
            issuedAt: item.issuedAt || new Date().toISOString(),
            title: String(item.title || 'MealQuest Invoice')
        }));
    },

    cancelAccount: async (
        storeId: string,
        userId = ''
    ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
        const session = await ensureCustomerSession(storeId, userId);
        return requestJson({
            method: 'POST',
            path: '/api/privacy/cancel-account',
            token: session.token,
            data: {
                merchantId: storeId
            }
        });
    }
};
