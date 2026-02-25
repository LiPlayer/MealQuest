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
    loginByPhone: jest.fn(async () => ({ token: 'token_demo', profile: { role: 'OWNER', merchantId: 'm_store_001', phone: '+8613800000000' } })),
    getState: jest.fn(async () => ({
      merchantId: 'm_store_001',
      merchantName: 'Demo Merchant',
      killSwitchEnabled: false,
      budgetCap: 300,
      budgetUsed: 50,
      pendingProposals: [],
      activeCampaigns: [
        {
          id: 'campaign_demo',
          name: 'Demo Campaign',
          status: 'ACTIVE',
          triggerEvent: 'APP_OPEN',
          condition: {field: 'weather', equals: 'RAIN'},
          budget: {cap: 80, used: 0, costPerHit: 8},
        },
      ],
    })),
    getStrategyLibrary: jest.fn(async () => ({merchantId: 'm_store_001', templates: []})),
    getAuditLogs: jest.fn(async () => ({
      merchantId: 'm_store_001',
      items: [],
      pageInfo: {limit: 6, hasMore: false, nextCursor: null},
    })),
    getAllianceConfig: jest.fn(async () => ({
      merchantId: 'm_store_001',
      clusterId: 'cluster_demo_brand',
      stores: ['m_store_001', 'm_bistro'],
      walletShared: false,
      tierShared: false,
      updatedAt: '2026-02-21T00:00:00.000Z',
    })),
    listStores: jest.fn(async () => ({
      merchantId: 'm_store_001',
      clusterId: 'cluster_demo_brand',
      walletShared: false,
      tierShared: false,
      stores: [
        {merchantId: 'm_store_001', name: 'Demo Merchant'},
        {merchantId: 'm_bistro', name: 'Bistro Harbor'},
      ],
    })),
    getWsUrl: jest.fn(() => ''),
    setCampaignStatus: jest.fn(async () => ({
      merchantId: 'm_store_001',
      campaignId: 'campaign_demo',
      status: 'PAUSED',
    })),
    setAllianceConfig: jest.fn(async () => ({
      merchantId: 'm_store_001',
      clusterId: 'cluster_demo_brand',
      stores: ['m_store_001', 'm_bistro'],
      walletShared: true,
      tierShared: false,
      updatedAt: '2026-02-21T00:00:00.000Z',
    })),
    syncAllianceUser: jest.fn(async () => ({
      merchantId: 'm_store_001',
      userId: 'u_demo',
      syncedStores: ['m_store_001', 'm_bistro'],
    })),
    createFireSale: jest.fn(async () => ({
      merchantId: 'm_store_001',
      campaignId: 'fire_1',
      priority: 999,
      ttlUntil: '2026-02-21T01:00:00.000Z',
    })),
    createStrategyProposal: jest.fn(async () => ({
      proposalId: 'proposal_ai_1',
      status: 'PENDING',
      title: 'AI策略提案：午市拉新',
      campaignId: 'campaign_ai_1',
    })),
    approveProposal: jest.fn(),
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
        .findByProps({testID: 'campaign-toggle-campaign_demo'})
        .props.onPress();
      await flush(4);
    });
    expect(mockApi.setCampaignStatus).toHaveBeenCalledWith('token_demo', {
      campaignId: 'campaign_demo',
      status: 'PAUSED',
    });

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'alliance-wallet-toggle'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.setAllianceConfig).toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'alliance-sync-user'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.syncAllianceUser).toHaveBeenCalledWith('token_demo', {
      userId: 'u_demo',
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

    expect(mockApi.createStrategyProposal).toHaveBeenCalledWith('token_demo', {
      intent: '明天午市拉新20桌，预算控制在200元以内',
    });

    const actionText = tree!.root.findByProps({testID: 'last-action-text'});
    expect(String(actionText.props.children)).toContain('AI已生成提案');
  });
});
