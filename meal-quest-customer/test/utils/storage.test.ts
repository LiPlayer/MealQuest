import { storage } from '@/utils/storage';
import Taro from '@tarojs/taro';

// Mock Taro API
jest.mock('@tarojs/taro', () => ({
    setStorageSync: jest.fn(),
    getStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
}));

describe('Storage Utils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should save store ID correctly', () => {
        const storeId = 'store_123';
        storage.setLastStoreId(storeId);
        expect(Taro.setStorageSync).toHaveBeenCalledWith('mq_last_store_id', storeId);
    });

    it('should retrieve store ID correctly', () => {
        (Taro.getStorageSync as jest.Mock).mockReturnValue('store_123');
        const result = storage.getLastStoreId();
        expect(Taro.getStorageSync).toHaveBeenCalledWith('mq_last_store_id');
        expect(result).toBe('store_123');
    });

    it('should return null if no store ID exists', () => {
        (Taro.getStorageSync as jest.Mock).mockReturnValue('');
        const result = storage.getLastStoreId();
        expect(result).toBeNull();
    });

    it('should remove store ID correctly', () => {
        storage.removeLastStoreId();
        expect(Taro.removeStorageSync).toHaveBeenCalledWith('mq_last_store_id');
    });

    it('should cache and load home snapshot by store/user key', () => {
        const snapshot = {wallet: {principal: 1, bonus: 2, silver: 3}};
        storage.setCachedHomeSnapshot('m_store_001', 'u_demo', snapshot);
        expect(Taro.setStorageSync).toHaveBeenCalledWith(
            'mq_home_snapshot:m_store_001:u_demo',
            JSON.stringify(snapshot),
        );

        (Taro.getStorageSync as jest.Mock).mockReturnValue(JSON.stringify(snapshot));
        const loaded = storage.getCachedHomeSnapshot('m_store_001', 'u_demo');
        expect(Taro.getStorageSync).toHaveBeenCalledWith('mq_home_snapshot:m_store_001:u_demo');
        expect(loaded).toEqual(snapshot);
    });

    it('should return null when cached snapshot is invalid json', () => {
        (Taro.getStorageSync as jest.Mock).mockReturnValue('{bad-json');
        const loaded = storage.getCachedHomeSnapshot('m_store_001', 'u_demo');
        expect(loaded).toBeNull();
    });

    it('should clear customer session keys', () => {
        storage.clearCustomerSession('m_store_001', 'u_demo');
        expect(Taro.removeStorageSync).toHaveBeenCalledWith('mq_home_snapshot:m_store_001:u_demo');
        expect(Taro.setStorageSync).toHaveBeenCalledWith('mq_api_token', '');
        expect(Taro.removeStorageSync).toHaveBeenCalledWith('mq_api_token_merchant_id');
        expect(Taro.removeStorageSync).toHaveBeenCalledWith('mq_customer_user_id');
        expect(Taro.removeStorageSync).toHaveBeenCalledWith('mq_last_store_id');
    });

    it('should save and read customer user identity keys', () => {
        storage.setCustomerUserId('u_abc');
        expect(Taro.setStorageSync).toHaveBeenCalledWith('mq_customer_user_id', 'u_abc');

        storage.setApiTokenMerchantId('m_store_001');
        expect(Taro.setStorageSync).toHaveBeenCalledWith('mq_api_token_merchant_id', 'm_store_001');

        (Taro.getStorageSync as jest.Mock).mockImplementation((key: string) => {
            if (key === 'mq_customer_user_id') {
                return 'u_abc';
            }
            if (key === 'mq_api_token_merchant_id') {
                return 'm_store_001';
            }
            return '';
        });

        expect(storage.getCustomerUserId()).toBe('u_abc');
        expect(storage.getApiTokenMerchantId()).toBe('m_store_001');
    });
});
