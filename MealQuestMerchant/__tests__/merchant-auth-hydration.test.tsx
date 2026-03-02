import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { MerchantProvider, useMerchant } from '../src/context/MerchantContext';
import { getMerchantStores } from '../src/services/apiClient';
import { clearMerchantAuthSession, loadMerchantAuthSession } from '../src/services/authSessionStorage';

jest.mock('@langchain/langgraph-sdk/react', () => ({
  useStream: () => ({
    messages: [],
    isLoading: false,
    submit: jest.fn(),
    stop: jest.fn(),
  }),
}));

jest.mock('../src/services/apiClient', () => ({
  completeMerchantOnboard: jest.fn(),
  getApiBaseUrl: jest.fn(() => 'http://127.0.0.1:3030'),
  getMerchantStores: jest.fn(),
  loginMerchantByPhone: jest.fn(),
  requestMerchantPhoneCode: jest.fn(),
}));

jest.mock('../src/services/authSessionStorage', () => ({
  clearMerchantAuthSession: jest.fn(),
  loadMerchantAuthSession: jest.fn(),
  saveMerchantAuthSession: jest.fn(),
}));

const mockedGetMerchantStores = getMerchantStores as jest.MockedFunction<typeof getMerchantStores>;
const mockedLoadMerchantAuthSession = loadMerchantAuthSession as jest.MockedFunction<typeof loadMerchantAuthSession>;
const mockedClearMerchantAuthSession = clearMerchantAuthSession as jest.MockedFunction<typeof clearMerchantAuthSession>;

type MerchantSnapshot = ReturnType<typeof useMerchant> | null;
let snapshot: MerchantSnapshot = null;

function Probe() {
  snapshot = useMerchant();
  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('merchant auth session hydration', () => {
  beforeEach(() => {
    snapshot = null;
    mockedLoadMerchantAuthSession.mockReset();
    mockedGetMerchantStores.mockReset();
    mockedClearMerchantAuthSession.mockReset();
    mockedClearMerchantAuthSession.mockResolvedValue(undefined);
  });

  test('restores session after startup validation succeeds', async () => {
    mockedLoadMerchantAuthSession.mockResolvedValue({
      token: 'token_ok',
      merchantId: 'm_store_001',
      role: 'OWNER',
      phone: '+8613900000001',
      merchantName: 'Demo Bistro',
    });
    mockedGetMerchantStores.mockResolvedValue({
      merchantId: 'm_store_001',
      clusterId: 'cluster_m_store_001',
      walletShared: false,
      tierShared: false,
      stores: [{ merchantId: 'm_store_001', name: 'Demo Bistro' }],
    });

    await act(async () => {
      TestRenderer.create(
        <MerchantProvider>
          <Probe />
        </MerchantProvider>,
      );
    });
    await flushEffects();

    expect(snapshot?.authHydrating).toBe(false);
    expect(snapshot?.isAuthenticated).toBe(true);
    expect(snapshot?.authSession?.merchantId).toBe('m_store_001');
    expect(snapshot?.merchantState.merchantName).toBe('Demo Bistro');
  });

  test('clears persisted session when startup validation fails', async () => {
    mockedLoadMerchantAuthSession.mockResolvedValue({
      token: 'token_bad',
      merchantId: 'm_store_001',
      role: 'OWNER',
      phone: '+8613900000001',
      merchantName: 'Demo Bistro',
    });
    mockedGetMerchantStores.mockRejectedValue(new Error('Authorization Bearer token is required'));

    await act(async () => {
      TestRenderer.create(
        <MerchantProvider>
          <Probe />
        </MerchantProvider>,
      );
    });
    await flushEffects();

    expect(snapshot?.authHydrating).toBe(false);
    expect(snapshot?.isAuthenticated).toBe(false);
    expect(mockedClearMerchantAuthSession).toHaveBeenCalledTimes(1);
  });
});
