import Taro from '@tarojs/taro';

const LAST_STORE_ID_KEY = 'mq_last_store_id';
const API_TOKEN_KEY = 'mq_api_token';
const API_TOKEN_MERCHANT_KEY = 'mq_api_token_merchant_id';
const CUSTOMER_USER_ID_KEY = 'mq_customer_user_id';
const HOME_SNAPSHOT_CACHE_PREFIX = 'mq_home_snapshot';

const buildHomeSnapshotKey = (storeId: string, userId: string) =>
    `${HOME_SNAPSHOT_CACHE_PREFIX}:${storeId}:${userId}`;

export const storage = {
    /**
     * Save the last visited store ID
     */
    setLastStoreId: (id: string) => {
        Taro.setStorageSync(LAST_STORE_ID_KEY, id);
    },

    /**
     * Get the last visited store ID
     */
    getLastStoreId: (): string | null => {
        return Taro.getStorageSync(LAST_STORE_ID_KEY) || null;
    },

    removeLastStoreId: () => {
        Taro.removeStorageSync(LAST_STORE_ID_KEY);
    },

    setApiToken: (token: string) => {
        Taro.setStorageSync(API_TOKEN_KEY, token);
    },

    getApiToken: (): string | null => {
        return Taro.getStorageSync(API_TOKEN_KEY) || null;
    },

    setApiTokenMerchantId: (merchantId: string) => {
        Taro.setStorageSync(API_TOKEN_MERCHANT_KEY, merchantId);
    },

    getApiTokenMerchantId: (): string | null => {
        return Taro.getStorageSync(API_TOKEN_MERCHANT_KEY) || null;
    },

    setCustomerUserId: (userId: string) => {
        Taro.setStorageSync(CUSTOMER_USER_ID_KEY, userId);
    },

    getCustomerUserId: (): string | null => {
        return Taro.getStorageSync(CUSTOMER_USER_ID_KEY) || null;
    },

    setCachedHomeSnapshot: (storeId: string, userId: string, snapshot: unknown) => {
        Taro.setStorageSync(buildHomeSnapshotKey(storeId, userId), JSON.stringify(snapshot));
    },

    getCachedHomeSnapshot: <T>(storeId: string, userId: string): T | null => {
        const raw = Taro.getStorageSync(buildHomeSnapshotKey(storeId, userId));
        if (!raw || typeof raw !== 'string') {
            return null;
        }
        try {
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    },

    clearCachedHomeSnapshot: (storeId: string, userId: string) => {
        Taro.removeStorageSync(buildHomeSnapshotKey(storeId, userId));
    },

    clearCustomerSession: (storeId: string, userId: string) => {
        storage.clearCachedHomeSnapshot(storeId, userId);
        storage.setApiToken('');
        Taro.removeStorageSync(API_TOKEN_MERCHANT_KEY);
        Taro.removeStorageSync(CUSTOMER_USER_ID_KEY);
        storage.removeLastStoreId();
    },

    /**
     * Clear all storage (for testing purposes)
     */
    clear: () => {
        Taro.removeStorageSync(LAST_STORE_ID_KEY);
        Taro.removeStorageSync(API_TOKEN_KEY);
        Taro.removeStorageSync(API_TOKEN_MERCHANT_KEY);
        Taro.removeStorageSync(CUSTOMER_USER_ID_KEY);
    }
};
