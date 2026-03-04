import { apiRequestJson } from '@/adapters/api/client';
import { HomeSnapshot } from '@/services/dataTypes';
import { storage } from '@/utils/storage';

import { toHomeSnapshot } from './mappers';
import { ensureCustomerSession } from './sessionService';

type ExistsResponse = {
  exists?: boolean;
};

type StateResponse = Record<string, unknown>;

export async function isMerchantAvailable(merchantId: string): Promise<boolean> {
  const safeMerchantId = String(merchantId || '').trim();
  if (!safeMerchantId) {
    return false;
  }
  const response = await apiRequestJson<ExistsResponse>({
    method: 'GET',
    path: `/api/merchant/exists?merchantId=${encodeURIComponent(safeMerchantId)}`,
  });
  return Boolean(response.exists);
}

export async function getHomeSnapshot(merchantId: string): Promise<HomeSnapshot> {
  const safeMerchantId = String(merchantId || '').trim();
  if (!safeMerchantId) {
    throw new Error('storeId is required');
  }

  const session = await ensureCustomerSession(safeMerchantId);
  const response = await apiRequestJson<StateResponse>({
    method: 'GET',
    path: `/api/state?merchantId=${encodeURIComponent(safeMerchantId)}&userId=${encodeURIComponent(session.userId)}`,
    token: session.token,
  });

  const snapshot = toHomeSnapshot(response);
  storage.setCachedHomeSnapshot(safeMerchantId, session.userId, snapshot);
  return snapshot;
}
