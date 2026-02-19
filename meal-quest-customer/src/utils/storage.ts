import Taro from '@tarojs/taro';

const LAST_STORE_ID_KEY = 'mq_last_store_id';

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

    /**
     * Clear all storage (for testing purposes)
     */
    clear: () => {
        Taro.removeStorageSync(LAST_STORE_ID_KEY);
    }
};
