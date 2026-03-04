import { apiRequestJson } from '@/adapters/api/client';
import { InvoiceItem, PaymentLedgerItem } from '@/services/dataTypes';

import { toInvoices, toPaymentLedger } from './mappers';
import { ensureCustomerSession } from './sessionService';

export async function getPaymentLedger(
  merchantId: string,
  limit = 20,
): Promise<PaymentLedgerItem[]> {
  const safeMerchantId = String(merchantId || '').trim();
  const session = await ensureCustomerSession(safeMerchantId);
  const response = await apiRequestJson<{ items?: unknown[] }>({
    method: 'GET',
    path:
      `/api/payment/ledger?merchantId=${encodeURIComponent(safeMerchantId)}` +
      `&userId=${encodeURIComponent(session.userId)}` +
      `&limit=${encodeURIComponent(String(limit))}`,
    token: session.token,
  });
  return toPaymentLedger(response.items || [], {
    merchantId: safeMerchantId,
    userId: session.userId,
  });
}

export async function getInvoices(
  merchantId: string,
  limit = 20,
): Promise<InvoiceItem[]> {
  const safeMerchantId = String(merchantId || '').trim();
  const session = await ensureCustomerSession(safeMerchantId);
  const response = await apiRequestJson<{ items?: unknown[] }>({
    method: 'GET',
    path:
      `/api/invoice/list?merchantId=${encodeURIComponent(safeMerchantId)}` +
      `&userId=${encodeURIComponent(session.userId)}` +
      `&limit=${encodeURIComponent(String(limit))}`,
    token: session.token,
  });
  return toInvoices(response.items || [], {
    merchantId: safeMerchantId,
    userId: session.userId,
  });
}

export async function cancelAccount(
  merchantId: string,
): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> {
  const safeMerchantId = String(merchantId || '').trim();
  const session = await ensureCustomerSession(safeMerchantId);
  return apiRequestJson({
    method: 'POST',
    path: '/api/privacy/cancel-account',
    token: session.token,
    data: {
      merchantId: safeMerchantId,
    },
  });
}
