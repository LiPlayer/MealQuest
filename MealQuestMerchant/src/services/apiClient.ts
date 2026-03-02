import { Platform } from 'react-native';
import Config from 'react-native-config';

export type MerchantProfile = {
  role: string;
  merchantId: string | null;
  phone: string;
};

export type MerchantPhoneLoginResult =
  | {
    status: 'BOUND';
    token: string;
    profile: MerchantProfile;
    merchant: {
      merchantId: string;
      name: string;
      ownerPhone?: string;
    };
  }
  | {
    status: 'ONBOARD_REQUIRED';
    onboardingToken: string;
    profile: MerchantProfile;
  };

export type MerchantCompleteOnboardResult = {
  status: 'BOUND';
  token: string;
  profile: MerchantProfile;
  merchant: {
    merchantId: string;
    name: string;
    ownerPhone?: string;
  };
};

export type MerchantStoresResponse = {
  merchantId: string;
  clusterId: string;
  walletShared: boolean;
  tierShared: boolean;
  stores: Array<{
    merchantId: string;
    name: string;
  }>;
};

const DEFAULT_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3030',
  default: 'http://127.0.0.1:3030',
});

export function getApiBaseUrl(): string {
  const envUrl = typeof Config.MQ_SERVER_URL === 'string' ? Config.MQ_SERVER_URL.trim() : '';
  return envUrl || String(DEFAULT_BASE_URL || 'http://127.0.0.1:3030');
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  options: { token?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data.error === 'string' ? data.error : `request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

async function getJson<T>(
  path: string,
  options: { token?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data.error === 'string' ? data.error : `request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function requestMerchantPhoneCode(phone: string): Promise<void> {
  await postJson('/api/auth/merchant/request-code', { phone });
}

export async function loginMerchantByPhone(params: {
  phone: string;
  code: string;
}): Promise<MerchantPhoneLoginResult> {
  return postJson<MerchantPhoneLoginResult>('/api/auth/merchant/phone-login', {
    phone: params.phone,
    code: params.code,
  });
}

export async function completeMerchantOnboard(params: {
  onboardingToken: string;
  name: string;
}): Promise<MerchantCompleteOnboardResult> {
  return postJson<MerchantCompleteOnboardResult>(
    '/api/auth/merchant/complete-onboard',
    {
      name: params.name,
    },
    { token: params.onboardingToken },
  );
}

export async function getMerchantStores(params: {
  merchantId: string;
  token: string;
}): Promise<MerchantStoresResponse> {
  const merchantId = String(params.merchantId || '').trim();
  if (!merchantId) {
    throw new Error('merchantId is required');
  }
  return getJson<MerchantStoresResponse>(
    `/api/merchant/stores?merchantId=${encodeURIComponent(merchantId)}`,
    { token: params.token },
  );
}
