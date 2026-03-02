import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearMerchantAuthSession,
  loadMerchantAuthSession,
  saveMerchantAuthSession,
} from '../src/services/authSessionStorage';

const MERCHANT_AUTH_SESSION_KEY = 'mq_merchant_auth_session';

describe('merchant auth session storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('saves and loads merchant auth session', async () => {
    await saveMerchantAuthSession({
      token: 'token_1',
      merchantId: 'm_store_001',
      role: 'OWNER',
      phone: '+8613900000001',
      merchantName: 'Demo Store',
    });

    const session = await loadMerchantAuthSession();
    expect(session).toEqual({
      token: 'token_1',
      merchantId: 'm_store_001',
      role: 'OWNER',
      phone: '+8613900000001',
      merchantName: 'Demo Store',
    });
  });

  test('returns null and clears invalid JSON payload', async () => {
    await AsyncStorage.setItem(MERCHANT_AUTH_SESSION_KEY, '{invalid');

    const session = await loadMerchantAuthSession();
    const rawAfter = await AsyncStorage.getItem(MERCHANT_AUTH_SESSION_KEY);
    expect(session).toBeNull();
    expect(rawAfter).toBeNull();
  });

  test('clear removes stored merchant auth session', async () => {
    await saveMerchantAuthSession({
      token: 'token_2',
      merchantId: 'm_store_002',
      role: 'OWNER',
      phone: '+8613900000002',
      merchantName: 'Store 2',
    });

    await clearMerchantAuthSession();
    const session = await loadMerchantAuthSession();
    expect(session).toBeNull();
  });
});
