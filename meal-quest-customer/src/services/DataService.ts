import { CheckoutQuote } from '@/domain/smartCheckout';
import { storage } from '@/utils/storage';

import { ApiDataService } from './ApiDataService';
import { HomeSnapshot, MockDataService } from './MockDataService';

const shouldUseRemote = () => {
    const envFlag = typeof process !== 'undefined'
        && process.env
        && process.env.TARO_APP_USE_REMOTE_API === 'true';
    return Boolean(envFlag || storage.getUseRemoteApi()) && ApiDataService.isConfigured();
};

export const DataService = {
    getHomeSnapshot: async (storeId: string, userId = 'u_demo'): Promise<HomeSnapshot> => {
        if (shouldUseRemote()) {
            try {
                return await ApiDataService.getHomeSnapshot(storeId, userId);
            } catch (error) {
                console.warn('Remote getHomeSnapshot failed, fallback to mock:', error);
                storage.setApiToken('');
            }
        }
        return MockDataService.getHomeSnapshot(storeId, userId);
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = 'u_demo'): Promise<CheckoutQuote> => {
        if (shouldUseRemote()) {
            try {
                return await ApiDataService.getCheckoutQuote(storeId, orderAmount, userId);
            } catch (error) {
                console.warn('Remote getCheckoutQuote failed, fallback to mock:', error);
                storage.setApiToken('');
            }
        }
        return MockDataService.getCheckoutQuote(storeId, orderAmount, userId);
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = 'u_demo'
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        if (shouldUseRemote()) {
            try {
                return await ApiDataService.executeCheckout(storeId, orderAmount, userId);
            } catch (error) {
                console.warn('Remote executeCheckout failed, fallback to mock:', error);
                storage.setApiToken('');
            }
        }
        return MockDataService.executeCheckout(storeId, orderAmount, userId);
    }
};
