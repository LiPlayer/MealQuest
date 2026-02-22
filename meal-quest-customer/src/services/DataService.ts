import { CheckoutQuote } from '@/domain/smartCheckout';
import { ApiDataService } from './ApiDataService';
import { HomeSnapshot, InvoiceItem, PaymentLedgerItem } from './dataTypes';

export const DataService = {
    getHomeSnapshot: async (storeId: string, userId = 'u_demo'): Promise<HomeSnapshot> => {
        return await ApiDataService.getHomeSnapshot(storeId, userId);
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = 'u_demo'): Promise<CheckoutQuote> => {
        return await ApiDataService.getCheckoutQuote(storeId, orderAmount, userId);
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = 'u_demo'
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        return await ApiDataService.executeCheckout(storeId, orderAmount, userId);
    },

    getPaymentLedger: async (
        storeId: string,
        userId = 'u_demo',
        limit = 20
    ): Promise<PaymentLedgerItem[]> => {
        return await ApiDataService.getPaymentLedger(storeId, userId, limit);
    },

    getInvoices: async (
        storeId: string,
        userId = 'u_demo',
        limit = 20
    ): Promise<InvoiceItem[]> => {
        return await ApiDataService.getInvoices(storeId, userId, limit);
    },

    cancelAccount: async (
        storeId: string,
        userId = 'u_demo'
    ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
        return await ApiDataService.cancelAccount(storeId, userId);
    }
};
