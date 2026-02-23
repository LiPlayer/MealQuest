import { CheckoutQuote } from '@/domain/smartCheckout';
import { ApiDataService } from './ApiDataService';
import { MockDataService } from './MockDataService';
import { HomeSnapshot, InvoiceItem, PaymentLedgerItem } from './dataTypes';
import { storage } from '@/utils/storage';

const isRemoteModeEnabled = () => {
    const envValue = (process.env.TARO_APP_USE_REMOTE_API || '').trim().toLowerCase();
    return envValue === '1' || envValue === 'true' || storage.getUseRemoteApi();
};

const canUseRemote = () => isRemoteModeEnabled() && ApiDataService.isConfigured();

const runWithFallback = async <T>(
    actionName: string,
    remote: () => Promise<T>,
    fallback: () => Promise<T>
): Promise<T> => {
    if (!canUseRemote()) {
        return fallback();
    }

    try {
        return await remote();
    } catch (error) {
        storage.setApiToken('');
        console.warn(`[DataService] ${actionName} failed on remote, fallback to mock.`, error);
        return fallback();
    }
};

export const DataService = {
    getHomeSnapshot: async (storeId: string, userId = 'u_demo'): Promise<HomeSnapshot> => {
        if (!canUseRemote()) {
            return MockDataService.getHomeSnapshot(storeId, userId);
        }

        try {
            return await ApiDataService.getHomeSnapshot(storeId, userId);
        } catch (error) {
            storage.setApiToken('');
            console.warn('[DataService] getHomeSnapshot failed on remote, trying local cache.', error);
            const cached = storage.getCachedHomeSnapshot<HomeSnapshot>(storeId, userId);
            if (cached) {
                return cached;
            }
            return MockDataService.getHomeSnapshot(storeId, userId);
        }
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = 'u_demo'): Promise<CheckoutQuote> => {
        return runWithFallback(
            'getCheckoutQuote',
            () => ApiDataService.getCheckoutQuote(storeId, orderAmount, userId),
            () => MockDataService.getCheckoutQuote(storeId, orderAmount, userId)
        );
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = 'u_demo'
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        return runWithFallback(
            'executeCheckout',
            () => ApiDataService.executeCheckout(storeId, orderAmount, userId),
            () => MockDataService.executeCheckout(storeId, orderAmount, userId)
        );
    },

    getPaymentLedger: async (
        storeId: string,
        userId = 'u_demo',
        limit = 20
    ): Promise<PaymentLedgerItem[]> => {
        return runWithFallback(
            'getPaymentLedger',
            () => ApiDataService.getPaymentLedger(storeId, userId, limit),
            () => MockDataService.getPaymentLedger(storeId, userId, limit)
        );
    },

    getInvoices: async (
        storeId: string,
        userId = 'u_demo',
        limit = 20
    ): Promise<InvoiceItem[]> => {
        return runWithFallback(
            'getInvoices',
            () => ApiDataService.getInvoices(storeId, userId, limit),
            () => MockDataService.getInvoices(storeId, userId, limit)
        );
    },

    cancelAccount: async (
        storeId: string,
        userId = 'u_demo'
    ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
        return runWithFallback(
            'cancelAccount',
            () => ApiDataService.cancelAccount(storeId, userId),
            () => MockDataService.cancelAccount(storeId, userId)
        );
    }
};
