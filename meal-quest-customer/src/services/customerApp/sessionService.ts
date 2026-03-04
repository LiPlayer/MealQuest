import Taro from '@tarojs/taro';

import { apiRequestJson } from '@/adapters/api/client';
import { storage } from '@/utils/storage';
import { resolveCustomerAuthProvider } from '@/services/apiDataService/env';

type SessionInfo = {
  token: string;
  userId: string;
};

type LoginResponse = {
  token?: string;
  profile?: {
    userId?: string;
  };
};

function normalize(value: unknown): string {
  return String(value || '').trim();
}

async function requestLoginCode(): Promise<string> {
  const provider = resolveCustomerAuthProvider();
  const loginResult = await Taro.login();
  const loginRecord = loginResult as unknown as Record<string, unknown>;
  const code =
    provider === 'ALIPAY'
      ? normalize(loginRecord.authCode || loginRecord.code)
      : normalize(loginRecord.code || loginRecord.authCode);
  if (!code) {
    throw new Error(`${provider} login code is missing`);
  }
  return code;
}

function resolveLoginPath(): string {
  return resolveCustomerAuthProvider() === 'ALIPAY'
    ? '/api/auth/customer/alipay-login'
    : '/api/auth/customer/wechat-login';
}

export async function ensureCustomerSession(merchantId: string): Promise<SessionInfo> {
  const safeMerchantId = normalize(merchantId);
  if (!safeMerchantId) {
    throw new Error('merchantId is required');
  }

  const cachedToken = normalize(storage.getApiToken());
  const cachedUserId = normalize(storage.getCustomerUserId());
  const cachedMerchantId = normalize(storage.getApiTokenMerchantId());
  if (cachedToken && cachedUserId && cachedMerchantId === safeMerchantId) {
    return {
      token: cachedToken,
      userId: cachedUserId,
    };
  }

  const code = await requestLoginCode();
  const response = await apiRequestJson<LoginResponse>({
    method: 'POST',
    path: resolveLoginPath(),
    data: {
      merchantId: safeMerchantId,
      code,
    },
  });

  const token = normalize(response.token);
  const userId = normalize(response.profile && response.profile.userId);
  if (!token || !userId) {
    throw new Error('customer login failed');
  }

  storage.setApiToken(token);
  storage.setApiTokenMerchantId(safeMerchantId);
  storage.setCustomerUserId(userId);
  return {
    token,
    userId,
  };
}

export function clearSessionForMerchant(merchantId: string): void {
  const safeMerchantId = normalize(merchantId);
  const userId = normalize(storage.getCustomerUserId());
  if (safeMerchantId && userId) {
    storage.clearCachedHomeSnapshot(safeMerchantId, userId);
  }
  storage.setApiToken('');
  storage.setApiTokenMerchantId('');
  storage.setCustomerUserId('');
}
