import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { MerchantProvider, useMerchant } from '../src/context/MerchantContext';
import { loginMerchantByPhone } from '../src/services/apiClient';
import { loadMerchantAuthSession, saveMerchantAuthSession } from '../src/services/authSessionStorage';

const mockUseStreamSubmit = jest.fn();
const mockUseStreamStop = jest.fn();
let mockStreamMessages: unknown[] = [];
let mockStreamLoading = false;

jest.mock('@langchain/langgraph-sdk/react', () => ({
  useStream: () => ({
    messages: mockStreamMessages,
    isLoading: mockStreamLoading,
    submit: mockUseStreamSubmit,
    stop: mockUseStreamStop,
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

const mockedLoginMerchantByPhone = loginMerchantByPhone as jest.MockedFunction<typeof loginMerchantByPhone>;
const mockedLoadMerchantAuthSession = loadMerchantAuthSession as jest.MockedFunction<typeof loadMerchantAuthSession>;
const mockedSaveMerchantAuthSession = saveMerchantAuthSession as jest.MockedFunction<typeof saveMerchantAuthSession>;

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

describe('merchant chat send feedback', () => {
  beforeEach(() => {
    snapshot = null;
    mockUseStreamSubmit.mockReset().mockResolvedValue(undefined);
    mockUseStreamStop.mockReset();
    mockStreamMessages = [];
    mockStreamLoading = false;

    mockedLoadMerchantAuthSession.mockReset();
    mockedLoadMerchantAuthSession.mockResolvedValue(null);
    mockedLoginMerchantByPhone.mockReset();
    mockedSaveMerchantAuthSession.mockReset();
    mockedSaveMerchantAuthSession.mockResolvedValue(undefined);

    if (typeof (globalThis as { ReadableStream?: unknown }).ReadableStream !== 'function') {
      (globalThis as { ReadableStream?: unknown }).ReadableStream = class {};
    }
    if (typeof (globalThis as { TextDecoder?: unknown }).TextDecoder !== 'function') {
      (globalThis as { TextDecoder?: unknown }).TextDecoder = class {
        decode() {
          return '';
        }
      };
    }
  });

  test('adds optimistic user message and clears draft on successful submit', async () => {
    mockedLoginMerchantByPhone.mockResolvedValue({
      status: 'BOUND',
      token: 'token_ok',
      profile: {
        role: 'OWNER',
        merchantId: 'm_store_001',
        phone: '+8613900000001',
      },
      merchant: {
        merchantId: 'm_store_001',
        name: 'Demo Bistro',
      },
    });

    await act(async () => {
      TestRenderer.create(
        <MerchantProvider>
          <Probe />
        </MerchantProvider>,
      );
    });
    await flushEffects();

    await act(async () => {
      await snapshot?.loginWithPhone({ phone: '+8613900000001', code: '123456' });
    });
    await act(async () => {
      snapshot?.setAiIntentDraft('今天午市做拉新活动');
    });
    await act(async () => {
      await snapshot?.onCreateIntentProposal();
    });

    expect(mockUseStreamSubmit).toHaveBeenCalledTimes(1);
    const optimistic = snapshot?.strategyChatMessages.find(
      item => item.role === 'USER' && item.text === '今天午市做拉新活动',
    );
    expect(optimistic?.deliveryStatus).toBe('sent');
    expect(snapshot?.chatSendPhase).toBe('idle');
    expect(snapshot?.chatSendError).toBe('');
    expect(snapshot?.aiIntentDraft).toBe('');
  });

  test('marks optimistic message failed and supports retry populate', async () => {
    mockedLoginMerchantByPhone.mockResolvedValue({
      status: 'BOUND',
      token: 'token_ok',
      profile: {
        role: 'OWNER',
        merchantId: 'm_store_001',
        phone: '+8613900000001',
      },
      merchant: {
        merchantId: 'm_store_001',
        name: 'Demo Bistro',
      },
    });
    mockUseStreamSubmit.mockRejectedValueOnce(new Error('network unavailable'));

    await act(async () => {
      TestRenderer.create(
        <MerchantProvider>
          <Probe />
        </MerchantProvider>,
      );
    });
    await flushEffects();

    await act(async () => {
      await snapshot?.loginWithPhone({ phone: '+8613900000001', code: '123456' });
    });
    await act(async () => {
      snapshot?.setAiIntentDraft('测试失败重试');
    });
    await act(async () => {
      await snapshot?.onCreateIntentProposal();
    });

    const failed = snapshot?.strategyChatMessages.find(
      item => item.role === 'USER' && item.text === '测试失败重试',
    );
    expect(failed?.deliveryStatus).toBe('failed');
    expect(snapshot?.chatSendPhase).toBe('failed');
    expect(snapshot?.chatSendError).toBe('network unavailable');

    await act(async () => {
      await snapshot?.onRetryMessage(String(failed?.messageId || ''));
    });
    expect(snapshot?.aiIntentDraft).toBe('测试失败重试');
    expect(snapshot?.chatSendPhase).toBe('idle');
    expect(snapshot?.chatSendError).toBe('');
  });
});
