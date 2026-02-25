import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Startup from '@/pages/startup/index';
import { storage } from '@/utils/storage';
import { ApiDataService } from '@/services/ApiDataService';
import Taro from '@tarojs/taro';

// Mock Storage (Local mock is fine for specific test behavior)
jest.mock('@/utils/storage', () => ({
    storage: {
        setLastStoreId: jest.fn(),
        getLastStoreId: jest.fn(),
        removeLastStoreId: jest.fn(),
    },
}));

jest.mock('@/services/ApiDataService', () => ({
    ApiDataService: {
        isConfigured: jest.fn(() => true),
        isMerchantAvailable: jest.fn(async () => true),
    },
}));

describe('Startup Page', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('New User: renders "Scan QR" button when no history', () => {
        // 1. Mock storage to return null (New User)
        (storage.getLastStoreId as jest.Mock).mockReturnValue(null);

        // 2. Render component
        render(<Startup />);

        // 3. Assertions
        expect(document.getElementById('startup-scan-button')).toBeInTheDocument();
        // Should NOT redirect
        expect(Taro.reLaunch).not.toHaveBeenCalled();
    });

    it('Old User: redirects immediately if history exists', () => {
        // 1. Mock storage to return existing store
        (storage.getLastStoreId as jest.Mock).mockReturnValue('store_001');

        // 2. Render component
        render(<Startup />);

        // 3. Assertions
        return waitFor(() => {
            expect(Taro.reLaunch).toHaveBeenCalledWith({ url: '/pages/index/index' });
        });
    });

    it('Scan Action: saves store ID and redirects', () => {
        (storage.getLastStoreId as jest.Mock).mockReturnValue(null);
        render(<Startup />);

        // Simulate click
        const scanButton = document.getElementById('startup-scan-button');
        expect(scanButton).not.toBeNull();
        fireEvent.click(scanButton as Element);

        // Verify scanCode called
        expect(Taro.scanCode).toHaveBeenCalled();
    });

    it('Scan Action: blocks unknown merchant id', async () => {
        (storage.getLastStoreId as jest.Mock).mockReturnValue(null);
        (ApiDataService.isConfigured as jest.Mock).mockReturnValue(true);
        (ApiDataService.isMerchantAvailable as jest.Mock).mockResolvedValue(false);
        (Taro.scanCode as jest.Mock).mockImplementation(({ success }) => {
            success({ result: 'm_not_exists' });
        });

        render(<Startup />);
        const scanButton = document.getElementById('startup-scan-button');
        expect(scanButton).not.toBeNull();
        fireEvent.click(scanButton as Element);

        await waitFor(() => {
            expect(ApiDataService.isMerchantAvailable).toHaveBeenCalledWith('m_not_exists');
            expect(storage.setLastStoreId).not.toHaveBeenCalled();
            expect(Taro.showToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Store not found' }),
            );
        });
    });

    it('Scan Action: redirects to payment page when payload contains action=pay', async () => {
        (storage.getLastStoreId as jest.Mock).mockReturnValue(null);
        (ApiDataService.isConfigured as jest.Mock).mockReturnValue(true);
        (ApiDataService.isMerchantAvailable as jest.Mock).mockResolvedValue(true);
        (Taro.scanCode as jest.Mock).mockImplementation(({ success }) => {
            success({ result: 'https://mealquest.app/startup?id=m_store_001&action=pay&orderAmount=88' });
        });

        render(<Startup />);
        const scanButton = document.getElementById('startup-scan-button');
        expect(scanButton).not.toBeNull();
        fireEvent.click(scanButton as Element);

        await waitFor(() => {
            expect(Taro.reLaunch).toHaveBeenCalledWith({
                url: '/pages/index/index?autoPay=1&orderAmount=88',
            });
        });
    });
});
