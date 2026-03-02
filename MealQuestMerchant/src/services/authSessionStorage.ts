import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MerchantAuthSession } from '../context/MerchantContext';

const MERCHANT_AUTH_SESSION_KEY = 'mq_merchant_auth_session';

export type PersistedMerchantAuthSession = MerchantAuthSession & {
  merchantName?: string;
};

function normalizeStoredSession(input: unknown): PersistedMerchantAuthSession | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const record = input as Record<string, unknown>;
  const token = String(record.token || '').trim();
  const merchantId = String(record.merchantId || '').trim();
  const role = String(record.role || '').trim();
  const phone = String(record.phone || '').trim();
  const merchantName = String(record.merchantName || '').trim();
  if (!token || !merchantId || !role || !phone) {
    return null;
  }
  return {
    token,
    merchantId,
    role,
    phone,
    merchantName: merchantName || undefined,
  };
}

export async function saveMerchantAuthSession(session: PersistedMerchantAuthSession): Promise<void> {
  await AsyncStorage.setItem(MERCHANT_AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function loadMerchantAuthSession(): Promise<PersistedMerchantAuthSession | null> {
  const raw = await AsyncStorage.getItem(MERCHANT_AUTH_SESSION_KEY);
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  try {
    const normalized = normalizeStoredSession(JSON.parse(raw));
    if (normalized) {
      return normalized;
    }
    await AsyncStorage.removeItem(MERCHANT_AUTH_SESSION_KEY);
    return null;
  } catch {
    await AsyncStorage.removeItem(MERCHANT_AUTH_SESSION_KEY);
    return null;
  }
}

export async function clearMerchantAuthSession(): Promise<void> {
  await AsyncStorage.removeItem(MERCHANT_AUTH_SESSION_KEY);
}
