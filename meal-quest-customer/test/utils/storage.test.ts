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
});
