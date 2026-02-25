import Taro from '@tarojs/taro';

import { storage } from '@/utils/storage';

import { CustomerAuthProvider, CustomerLoginResponse } from './contracts';
import { resolveCustomerAuthProvider } from './env';
import { requestJson } from './http';

const normalizeUserId = (input?: string) => String(input || '').trim();

const requestLoginCode = async (provider: CustomerAuthProvider) => {
  const loginResult = await Taro.login();
  const rawCode =
    provider === 'ALIPAY'
      ? (loginResult as any)?.authCode || (loginResult as any)?.code
      : (loginResult as any)?.code || (loginResult as any)?.authCode;
  const code = String(rawCode || '').trim();
  if (!code) {
    throw new Error(`${provider} login code is missing`);
  }
  return code;
};

export const ensureCustomerSession = async (
  merchantId: string,
  requestedUserId = '',
): Promise<{ token: string; userId: string }> => {
  const normalizedMerchantId = String(merchantId || '').trim();
  if (!normalizedMerchantId) {
    throw new Error('merchantId is required');
  }

  const _requestedUserId = requestedUserId;
  void _requestedUserId;

  const cachedToken = storage.getApiToken();
  const cachedUserId = normalizeUserId(storage.getCustomerUserId() || '');
  const cachedMerchantId = String(storage.getApiTokenMerchantId() || '').trim();
  if (cachedToken && cachedUserId && cachedMerchantId === normalizedMerchantId) {
    return { token: cachedToken, userId: cachedUserId };
  }

  const authProvider = resolveCustomerAuthProvider();
  const code = await requestLoginCode(authProvider);
  const loginPath =
    authProvider === 'ALIPAY' ? '/api/auth/customer/alipay-login' : '/api/auth/customer/wechat-login';
  const login = await requestJson({
    method: 'POST',
    path: loginPath,
    data: {
      merchantId: normalizedMerchantId,
      code,
    },
  });
  const typedLogin = login as CustomerLoginResponse;
  const token = String(typedLogin?.token || '').trim();
  const serverUserId = normalizeUserId(typedLogin?.profile?.userId || '');
  const userId = serverUserId;

  if (!token || !userId) {
    throw new Error('customer login failed');
  }

  storage.setApiToken(token);
  storage.setApiTokenMerchantId(normalizedMerchantId);
  storage.setCustomerUserId(userId);
  return { token, userId };
};
