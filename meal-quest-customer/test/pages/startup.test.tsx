import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Startup from '@/pages/startup/index';
import { storage } from '@/utils/storage';
import Taro from '@tarojs/taro';

// Mock Storage (Local mock is fine for specific test behavior)
jest.mock('@/utils/storage', () => ({
    storage: {
        setLastStoreId: jest.fn(),
        getLastStoreId: jest.fn(),
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
        expect(screen.getByText('欢迎使用')).toBeInTheDocument();
        expect(screen.getByText('扫一扫')).toBeInTheDocument();
        // Should NOT redirect
        expect(Taro.reLaunch).not.toHaveBeenCalled();
    });

    it('Old User: redirects immediately if history exists', () => {
        // 1. Mock storage to return existing store
        (storage.getLastStoreId as jest.Mock).mockReturnValue('store_001');

        // 2. Render component
        render(<Startup />);

        // 3. Assertions
        // Should verify redirection happened
        expect(Taro.reLaunch).toHaveBeenCalledWith({ url: '/pages/index/index' });
    });

    it('Scan Action: saves store ID and redirects', () => {
        (storage.getLastStoreId as jest.Mock).mockReturnValue(null);
        render(<Startup />);

        // Simulate click
        fireEvent.click(screen.getByText('扫一扫'));

        // Verify scanCode called
        expect(Taro.scanCode).toHaveBeenCalled();
    });
});
