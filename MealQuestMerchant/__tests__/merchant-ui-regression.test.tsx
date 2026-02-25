import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const {View} = require('react-native');
  return {
    SafeAreaProvider: ({children}: {children: React.ReactNode}) =>
      ReactLib.createElement(View, null, children),
    SafeAreaView: ({children}: {children: React.ReactNode}) =>
      ReactLib.createElement(View, null, children),
  };
});

jest.mock('../src/services/merchantRealtime', () => ({
  createRealtimeClient: jest.fn(() => ({
    close: jest.fn(),
  })),
}));

jest.mock('react-native-qrcode-svg', () => {
  const ReactLib = require('react');
  const {View} = require('react-native');
  return ({testID}: {testID?: string}) => ReactLib.createElement(View, {testID});
});

jest.mock('../src/services/merchantApi', () => ({
  MerchantApi: {
    isConfigured: jest.fn(() => true),
    requestMerchantLoginCode: jest.fn(async () => ({ phone: '+8613800000000', expiresInSec: 300, debugCode: '123456' })),
    loginByPhone: jest.fn(async () => ({ token: 'token_fixture', profile: { role: 'OWNER', merchantId: 'm_store_001', phone: '+8613800000000' } })),
    getState: jest.fn(async () => ({
      merchantId: 'm_store_001',
      merchantName: 'Fixture Merchant',
      killSwitchEnabled: false,
      budgetCap: 300,
      budgetUsed: 50,
      pendingProposals: [],
      activeCampaigns: [
        {
          id: 'campaign_fixture',
          name: 'Fixture Campaign',
          status: 'ACTIVE',
          triggerEvent: 'APP_OPEN',
          condition: {field: 'weather', equals: 'RAIN'},
          budget: {cap: 80, used: 0, costPerHit: 8},
        },
      ],
    })),
    getAuditLogs: jest.fn(async () => ({
      merchantId: 'm_store_001',
      items: [],
      pageInfo: {limit: 6, hasMore: false, nextCursor: null},
    })),
    getAllianceConfig: jest.fn(async () => ({
      merchantId: 'm_store_001',
      clusterId: 'cluster_fixture_brand',
      stores: ['m_store_001', 'm_bistro'],
      walletShared: false,
      tierShared: false,
      updatedAt: '2026-02-21T00:00:00.000Z',
    })),
    listStores: jest.fn(async () => ({
      merchantId: 'm_store_001',
      clusterId: 'cluster_fixture_brand',
      walletShared: false,
      tierShared: false,
      stores: [
        {merchantId: 'm_store_001', name: 'Fixture Merchant'},
        {merchantId: 'm_bistro', name: 'Bistro Harbor'},
      ],
    })),
    getWsUrl: jest.fn(() => ''),
    setCampaignStatus: jest.fn(async () => ({
      merchantId: 'm_store_001',
      campaignId: 'campaign_fixture',
      status: 'PAUSED',
    })),
    setAllianceConfig: jest.fn(async () => ({
      merchantId: 'm_store_001',
      clusterId: 'cluster_fixture_brand',
      stores: ['m_store_001', 'm_bistro'],
      walletShared: true,
      tierShared: false,
      updatedAt: '2026-02-21T00:00:00.000Z',
    })),
    syncAllianceUser: jest.fn(async () => ({
      merchantId: 'm_store_001',
      userId: 'u_customer_001',
      syncedStores: ['m_store_001', 'm_bistro'],
    })),
    createFireSale: jest.fn(async () => ({
      merchantId: 'm_store_001',
      campaignId: 'fire_1',
      priority: 999,
      ttlUntil: '2026-02-21T01:00:00.000Z',
    })),
    createStrategyChatSession: jest.fn(async () => ({
      merchantId: 'm_store_001',
      sessionId: 'sc_1',
      pendingReview: null,
      messages: [],
      activeCampaigns: [],
      approvedStrategies: [],
    })),
    getStrategyChatSession: jest.fn(async () => ({
      merchantId: 'm_store_001',
      sessionId: 'sc_1',
      pendingReview: null,
      messages: [],
      activeCampaigns: [],
      approvedStrategies: [],
    })),
    sendStrategyChatMessage: jest.fn(async () => ({
      merchantId: 'm_store_001',
      sessionId: 'sc_1',
      status: 'PENDING_REVIEW',
      pendingReview: {
        proposalId: 'proposal_ai_1',
        status: 'PENDING',
        title: 'AI Strategy Draft',
        templateId: 'activation_contextual_drop',
        branchId: 'COOLING',
        campaignId: 'campaign_ai_1',
        campaignName: 'AI Strategy Draft',
        triggerEvent: 'APP_OPEN',
        budget: {cap: 120, used: 0, costPerHit: 10},
        createdAt: '2026-02-25T00:00:00.000Z',
      },
      messages: [
        {
          messageId: 'msg_1',
          role: 'USER',
          type: 'TEXT',
          text: '明天午市拉新20桌，预算控制在200元以内',
          proposalId: null,
          metadata: null,
          createdAt: '2026-02-25T00:00:00.000Z',
        },
      ],
      activeCampaigns: [],
      approvedStrategies: [],
    })),
    reviewStrategyChatProposal: jest.fn(async () => ({
      merchantId: 'm_store_001',
      sessionId: 'sc_1',
      status: 'APPROVED',
      campaignId: 'campaign_ai_1',
      pendingReview: null,
      messages: [],
      activeCampaigns: [],
      approvedStrategies: [],
    })),
    setKillSwitch: jest.fn(),
    triggerEvent: jest.fn(async () => ({blockedByKillSwitch: false, executed: []})),
  },
}));

import App from '../App';
import {MerchantApi} from '../src/services/merchantApi';
const mockApi = MerchantApi as any;

const flush = async (times = 1) => {
  for (let i = 0; i < times; i += 1) {
    // Let pending promise queues settle.
    await Promise.resolve();
  }
};

describe('merchant ui regression flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.isConfigured.mockReturnValue(true);
    mockApi.getWsUrl.mockReturnValue('');
  });

  it('replays campaign and alliance actions in remote mode', async () => {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<App />);
      await flush(8);
    });

    await ReactTestRenderer.act(async () => {
      tree!.root
        .findByProps({testID: 'campaign-toggle-campaign_fixture'})
        .props.onPress();
      await flush(4);
    });
    expect(mockApi.setCampaignStatus).toHaveBeenCalledWith('token_fixture', {
      campaignId: 'campaign_fixture',
      status: 'PAUSED',
    });

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'alliance-wallet-toggle'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.setAllianceConfig).toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      tree!.root
        .findByProps({testID: 'alliance-user-id-input'})
        .props.onChangeText('u_customer_001');
      await flush(2);
    });

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'alliance-sync-user'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.syncAllianceUser).toHaveBeenCalledWith('token_fixture', {
      userId: 'u_customer_001',
    });

    await ReactTestRenderer.act(async () => {
      tree!.root
        .findByProps({testID: 'merchant-qr-store-id-input'})
        .props.onChangeText('m_store_001');
      tree!.root
        .findByProps({testID: 'merchant-qr-scene-input'})
        .props.onChangeText('table_a1');
      tree!.root.findByProps({testID: 'merchant-qr-generate'}).props.onPress();
      await flush(2);
    });
    tree!.root.findByProps({testID: 'merchant-qr-native'});
    const qrPayload = tree!.root.findByProps({testID: 'merchant-qr-payload-text'});
    expect(String(qrPayload.props.children)).toContain('https://mealquest.app/startup?id=m_store_001');
    expect(String(qrPayload.props.children)).toContain('action=pay');
  });

  it('submits free-text intent to generate AI proposal', async () => {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<App />);
      await flush(8);
    });

    await ReactTestRenderer.act(async () => {
      tree!.root
        .findByProps({testID: 'ai-intent-input'})
        .props.onChangeText('明天午市拉新20桌，预算控制在200元以内');
      await flush(2);
    });

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'ai-intent-submit'}).props.onPress();
      await flush(6);
    });

    expect(mockApi.sendStrategyChatMessage).toHaveBeenCalled();
    const [, payload] = mockApi.sendStrategyChatMessage.mock.calls[0];
    expect(payload.sessionId).toBe('sc_1');
    expect(typeof payload.content).toBe('string');
    expect(payload.content.length).toBeGreaterThan(4);
  });
});
