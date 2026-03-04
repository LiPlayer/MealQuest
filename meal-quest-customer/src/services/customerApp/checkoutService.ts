import { CheckoutQuote } from '@/domain/smartCheckout';
import { HomeSnapshot } from '@/services/dataTypes';
import { storage } from '@/utils/storage';
import { apiRequestJson } from '@/adapters/api/client';

import { toHomeSnapshot } from './mappers';
import { ensureCustomerSession } from './sessionService';
import { getHomeSnapshot } from './stateService';

type QuoteResponse = CheckoutQuote;

type VerifyResponse = {
  paymentTxnId: string;
  quote: CheckoutQuote;
  state?: Record<string, unknown>;
  merchant?: Record<string, unknown>;
  user?: Record<string, unknown>;
};

function extractStatePayload(response: VerifyResponse): Record<string, unknown> | null {
  if (response.state && typeof response.state === 'object') {
    return response.state;
  }
  if (response.merchant && response.user) {
    return response as unknown as Record<string, unknown>;
  }
  return null;
}

export async function getCheckoutQuote(
  merchantId: string,
  orderAmount: number,
): Promise<QuoteResponse> {
  const safeMerchantId = String(merchantId || '').trim();
  const session = await ensureCustomerSession(safeMerchantId);
  return apiRequestJson<QuoteResponse>({
    method: 'POST',
    path: '/api/payment/quote',
    token: session.token,
    data: {
      merchantId: safeMerchantId,
      userId: session.userId,
      orderAmount,
    },
  });
}

export async function executeCheckout(
  merchantId: string,
  orderAmount: number,
): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> {
  const safeMerchantId = String(merchantId || '').trim();
  const session = await ensureCustomerSession(safeMerchantId);
  const response = await apiRequestJson<VerifyResponse>({
    method: 'POST',
    path: '/api/payment/verify',
    token: session.token,
    data: {
      merchantId: safeMerchantId,
      userId: session.userId,
      orderAmount,
      includeState: true,
      idempotencyKey: `mini_${Date.now()}`,
    },
  });

  const statePayload = extractStatePayload(response);
  const snapshot = statePayload
    ? toHomeSnapshot(statePayload)
    : await getHomeSnapshot(safeMerchantId);
  storage.setCachedHomeSnapshot(safeMerchantId, session.userId, snapshot);
  return {
    paymentId: String(response.paymentTxnId || ''),
    quote: response.quote,
    snapshot,
  };
}
