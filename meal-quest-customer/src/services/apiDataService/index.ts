import { CheckoutQuote } from '@/domain/smartCheckout';
import { storage } from '@/utils/storage';

import { HomeSnapshot, InvoiceItem, PaymentLedgerItem } from '../dataTypes';
import { MerchantCatalogItem } from './contracts';
import { getEnv, getServerBaseUrl } from './env';
import { requestJson } from './http';
import { toHomeSnapshot } from './mappers';
import { ensureCustomerSession } from './session';

const getHomeSnapshot = async (storeId: string, userId = ''): Promise<HomeSnapshot> => {
  const targetStoreId = storeId || getEnv('TARO_APP_DEFAULT_STORE_ID');
  const targetStoreIdStr = String(targetStoreId || '').trim();
  if (!targetStoreIdStr) {
    throw new Error('storeId is required');
  }
  const session = await ensureCustomerSession(targetStoreIdStr, userId);
  const stateData = await requestJson({
    method: 'GET',
    path: `/api/state?merchantId=${encodeURIComponent(targetStoreIdStr)}&userId=${encodeURIComponent(session.userId)}`,
    token: session.token,
  });
  const snapshot = toHomeSnapshot(stateData);
  storage.setCachedHomeSnapshot(targetStoreIdStr, session.userId, snapshot);
  return snapshot;
};

export const ApiDataService = {
  isConfigured: () => Boolean(getServerBaseUrl()),

  isMerchantAvailable: async (merchantId: string): Promise<boolean> => {
    const target = String(merchantId || '').trim();
    if (!target) {
      return false;
    }
    const catalog = await requestJson({
      method: 'GET',
      path: '/api/merchant/catalog',
    });
    const items = Array.isArray(catalog?.items) ? (catalog.items as MerchantCatalogItem[]) : [];
    return items.some((item) => String(item?.merchantId || '').trim() === target);
  },

  getHomeSnapshot,

  getCheckoutQuote: async (storeId: string, orderAmount: number, userId = ''): Promise<CheckoutQuote> => {
    const session = await ensureCustomerSession(storeId, userId);
    return requestJson({
      method: 'POST',
      path: '/api/payment/quote',
      token: session.token,
      data: {
        merchantId: storeId,
        userId: session.userId,
        orderAmount,
      },
    });
  },

  executeCheckout: async (
    storeId: string,
    orderAmount: number,
    userId = '',
  ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
    const session = await ensureCustomerSession(storeId, userId);
    const quote = await requestJson({
      method: 'POST',
      path: '/api/payment/verify',
      token: session.token,
      data: {
        merchantId: storeId,
        userId: session.userId,
        orderAmount,
        idempotencyKey: `mini_${Date.now()}`,
      },
    });

    const snapshot = await getHomeSnapshot(storeId, session.userId);
    storage.setCachedHomeSnapshot(storeId, session.userId, snapshot);
    return {
      paymentId: quote.paymentTxnId,
      quote: quote.quote,
      snapshot,
    };
  },

  getPaymentLedger: async (
    storeId: string,
    userId = '',
    limit = 20,
  ): Promise<PaymentLedgerItem[]> => {
    const session = await ensureCustomerSession(storeId, userId);
    const result = await requestJson({
      method: 'GET',
      path: `/api/payment/ledger?merchantId=${encodeURIComponent(storeId)}&userId=${encodeURIComponent(session.userId)}&limit=${encodeURIComponent(String(limit))}`,
      token: session.token,
    });
    const items = Array.isArray(result.items) ? result.items : [];
    return items.map((item: any) => ({
      txnId: String(item.txnId || ''),
      merchantId: String(item.merchantId || storeId),
      userId: String(item.userId || session.userId),
      type: item.type || 'PAYMENT',
      amount: Number(item.amount || 0),
      timestamp: item.timestamp || new Date().toISOString(),
      paymentTxnId: item.details?.paymentTxnId || item.paymentTxnId,
    }));
  },

  getInvoices: async (storeId: string, userId = '', limit = 20): Promise<InvoiceItem[]> => {
    const session = await ensureCustomerSession(storeId, userId);
    const result = await requestJson({
      method: 'GET',
      path: `/api/invoice/list?merchantId=${encodeURIComponent(storeId)}&userId=${encodeURIComponent(session.userId)}&limit=${encodeURIComponent(String(limit))}`,
      token: session.token,
    });
    const items = Array.isArray(result.items) ? result.items : [];
    return items.map((item: any) => ({
      invoiceNo: String(item.invoiceNo || ''),
      merchantId: String(item.merchantId || storeId),
      userId: String(item.userId || session.userId),
      paymentTxnId: String(item.paymentTxnId || ''),
      amount: Number(item.amount || 0),
      status: String(item.status || 'ISSUED'),
      issuedAt: item.issuedAt || new Date().toISOString(),
      title: String(item.title || 'MealQuest Invoice'),
    }));
  },

  cancelAccount: async (
    storeId: string,
    userId = '',
  ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
    const session = await ensureCustomerSession(storeId, userId);
    return requestJson({
      method: 'POST',
      path: '/api/privacy/cancel-account',
      token: session.token,
      data: {
        merchantId: storeId,
      },
    });
  },
};
