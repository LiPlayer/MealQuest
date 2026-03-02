import { CheckoutQuote } from '@/domain/smartCheckout';
import { storage } from '@/utils/storage';

import { ApiDataService } from './ApiDataService';
import { HomeSnapshot, InvoiceItem, PaymentLedgerItem } from './dataTypes';

const ensureApiConfigured = () => {
    if (!ApiDataService.isConfigured()) {
        throw new Error('Missing TARO_APP_SERVER_URL');
    }
};

const runRemote = async <T>(actionName: string, action: () => Promise<T>): Promise<T> => {
    ensureApiConfigured();
    try {
        return await action();
    } catch (error) {
        storage.setApiToken('');
        storage.setApiTokenMerchantId('');
        storage.setCustomerUserId('');
        console.warn(`[DataService] ${actionName} failed on remote.`, error);
        throw error;
    }
};

export const DataService = {
    getHomeSnapshot: async (storeId: string, userId = ''): Promise<HomeSnapshot> => {
        return runRemote('getHomeSnapshot', () => ApiDataService.getHomeSnapshot(storeId, userId));
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = ''): Promise<CheckoutQuote> => {
        return runRemote(
            'getCheckoutQuote',
            () => ApiDataService.getCheckoutQuote(storeId, orderAmount, userId),
        );
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = ''
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        return runRemote(
            'executeCheckout',
            () => ApiDataService.executeCheckout(storeId, orderAmount, userId),
        );
    },

    getPaymentLedger: async (
        storeId: string,
        userId = '',
        limit = 20
    ): Promise<PaymentLedgerItem[]> => {
        return runRemote(
            'getPaymentLedger',
            () => ApiDataService.getPaymentLedger(storeId, userId, limit),
        );
    },

    getInvoices: async (
        storeId: string,
        userId = '',
        limit = 20
    ): Promise<InvoiceItem[]> => {
        return runRemote(
            'getInvoices',
            () => ApiDataService.getInvoices(storeId, userId, limit),
        );
    },

    cancelAccount: async (
        storeId: string,
        userId = ''
    ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
        return runRemote(
            'cancelAccount',
            () => ApiDataService.cancelAccount(storeId, userId),
        );
    }
};
