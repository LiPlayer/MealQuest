import Taro from '@tarojs/taro';

const LAST_STORE_ID_KEY = 'mq_last_store_id';
const API_TOKEN_KEY = 'mq_api_token';
const USE_REMOTE_API_KEY = 'mq_use_remote_api';

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

    setApiToken: (token: string) => {
        Taro.setStorageSync(API_TOKEN_KEY, token);
    },

    getApiToken: (): string | null => {
        return Taro.getStorageSync(API_TOKEN_KEY) || null;
    },

    setUseRemoteApi: (enabled: boolean) => {
        Taro.setStorageSync(USE_REMOTE_API_KEY, enabled ? '1' : '0');
    },

    getUseRemoteApi: (): boolean => {
        return Taro.getStorageSync(USE_REMOTE_API_KEY) === '1';
    },

    /**
     * Clear all storage (for testing purposes)
     */
    clear: () => {
        Taro.removeStorageSync(LAST_STORE_ID_KEY);
        Taro.removeStorageSync(API_TOKEN_KEY);
        Taro.removeStorageSync(USE_REMOTE_API_KEY);
    }
};
