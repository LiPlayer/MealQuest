import { CheckoutQuote } from '@/domain/smartCheckout';
import { HomeSnapshot, InvoiceItem, PaymentLedgerItem } from '@/services/dataTypes';
import { getServerBaseUrl } from '@/services/apiDataService/env';

import { cancelAccount, getInvoices, getPaymentLedger } from '@/services/customerApp/billingService';
import { executeCheckout, getCheckoutQuote } from '@/services/customerApp/checkoutService';
import { getHomeSnapshot, isMerchantAvailable } from '@/services/customerApp/stateService';

export const ApiDataService = {
  isConfigured: () => Boolean(getServerBaseUrl()),

  isMerchantAvailable: async (merchantId: string): Promise<boolean> => {
    return isMerchantAvailable(merchantId);
  },

  getHomeSnapshot: async (storeId: string, _userId = ''): Promise<HomeSnapshot> => {
    return getHomeSnapshot(storeId);
  },

  getCheckoutQuote: async (storeId: string, orderAmount: number, _userId = ''): Promise<CheckoutQuote> => {
    return getCheckoutQuote(storeId, orderAmount);
  },

  executeCheckout: async (
    storeId: string,
    orderAmount: number,
    _userId = '',
  ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
    return executeCheckout(storeId, orderAmount);
  },

  getPaymentLedger: async (storeId: string, _userId = '', limit = 20): Promise<PaymentLedgerItem[]> => {
    return getPaymentLedger(storeId, limit);
  },

  getInvoices: async (storeId: string, _userId = '', limit = 20): Promise<InvoiceItem[]> => {
    return getInvoices(storeId, limit);
  },

  cancelAccount: async (
    storeId: string,
    _userId = '',
  ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
    return cancelAccount(storeId);
  },
};
