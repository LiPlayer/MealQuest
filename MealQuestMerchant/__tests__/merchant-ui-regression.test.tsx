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

jest.mock('../src/services/merchantApi', () => ({
  MerchantApi: {
    isConfigured: jest.fn(() => true),
    loginAsMerchant: jest.fn(async () => 'token_demo'),
    getState: jest.fn(async () => ({
      merchantId: 'm_demo',
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
    getStrategyLibrary: jest.fn(async () => ({merchantId: 'm_demo', templates: []})),
    getAuditLogs: jest.fn(async () => ({
      merchantId: 'm_demo',
      items: [],
      pageInfo: {limit: 6, hasMore: false, nextCursor: null},
    })),
    getAllianceConfig: jest.fn(async () => ({
      merchantId: 'm_demo',
      clusterId: 'cluster_demo_brand',
      stores: ['m_demo', 'm_bistro'],
      walletShared: false,
      tierShared: false,
      updatedAt: '2026-02-21T00:00:00.000Z',
    })),
    listStores: jest.fn(async () => ({
      merchantId: 'm_demo',
      clusterId: 'cluster_demo_brand',
      walletShared: false,
      tierShared: false,
      stores: [
        {merchantId: 'm_demo', name: 'Demo Merchant'},
        {merchantId: 'm_bistro', name: 'Bistro Harbor'},
      ],
    })),
    getWsUrl: jest.fn(() => ''),
    setCampaignStatus: jest.fn(async () => ({
      merchantId: 'm_demo',
      campaignId: 'campaign_demo',
      status: 'PAUSED',
    })),
    setAllianceConfig: jest.fn(async () => ({
      merchantId: 'm_demo',
      clusterId: 'cluster_demo_brand',
      stores: ['m_demo', 'm_bistro'],
      walletShared: true,
      tierShared: false,
      updatedAt: '2026-02-21T00:00:00.000Z',
    })),
    syncAllianceUser: jest.fn(async () => ({
      merchantId: 'm_demo',
      userId: 'u_demo',
      syncedStores: ['m_demo', 'm_bistro'],
    })),
    socialTransfer: jest.fn(async () => ({
      transferId: 'transfer_1',
      merchantId: 'm_demo',
      fromUserId: 'u_demo',
      toUserId: 'u_friend',
      amount: 10,
      createdAt: '2026-02-21T00:00:00.000Z',
    })),
    createSocialRedPacket: jest.fn(async () => ({
      packetId: 'packet_1',
      merchantId: 'm_demo',
      senderUserId: 'u_demo',
      totalAmount: 30,
      totalSlots: 3,
      remainingAmount: 30,
      remainingSlots: 3,
      status: 'ACTIVE',
    })),
    claimSocialRedPacket: jest.fn(async () => ({
      packetId: 'packet_1',
      userId: 'u_friend',
      claimAmount: 8,
      packetStatus: 'ACTIVE',
      remainingAmount: 22,
      remainingSlots: 2,
    })),
    getSocialRedPacket: jest.fn(async () => ({
      packetId: 'packet_1',
      merchantId: 'm_demo',
      senderUserId: 'u_demo',
      totalAmount: 30,
      totalSlots: 3,
      remainingAmount: 22,
      remainingSlots: 2,
      status: 'ACTIVE',
    })),
    createTreatSession: jest.fn(async () => ({
      sessionId: 'session_1',
      merchantId: 'm_demo',
      initiatorUserId: 'u_demo',
      mode: 'MERCHANT_SUBSIDY',
      orderAmount: 80,
      subsidyRate: 0.2,
      subsidyCap: 20,
      dailySubsidyCap: 60,
      totalContributed: 0,
      status: 'OPEN',
      createdAt: '2026-02-21T00:00:00.000Z',
      expiresAt: '2026-02-21T01:00:00.000Z',
    })),
    joinTreatSession: jest.fn(async () => ({
      sessionId: 'session_1',
      merchantId: 'm_demo',
      userId: 'u_demo',
      amount: 30,
      totalContributed: 30,
      userWallet: {principal: 1, bonus: 1, silver: 1},
    })),
    closeTreatSession: jest.fn(async () => ({
      sessionId: 'session_1',
      merchantId: 'm_demo',
      initiatorUserId: 'u_demo',
      mode: 'MERCHANT_SUBSIDY',
      orderAmount: 80,
      subsidyRate: 0.2,
      subsidyCap: 20,
      dailySubsidyCap: 60,
      totalContributed: 70,
      status: 'SETTLED',
      createdAt: '2026-02-21T00:00:00.000Z',
      expiresAt: '2026-02-21T01:00:00.000Z',
    })),
    createFireSale: jest.fn(async () => ({
      merchantId: 'm_demo',
      campaignId: 'fire_1',
      priority: 999,
      ttlUntil: '2026-02-21T01:00:00.000Z',
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

  it('replays campaign/alliance/social/treat actions in remote mode', async () => {
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
      tree!.root.findByProps({testID: 'social-transfer-demo'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.socialTransfer).toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'social-redpacket-create'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.createSocialRedPacket).toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'social-redpacket-claim'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.claimSocialRedPacket).toHaveBeenCalled();
    expect(mockApi.getSocialRedPacket).toHaveBeenCalledWith('token_demo', {
      packetId: 'packet_1',
    });

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'treat-create'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.createTreatSession).toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'treat-join-demo'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.joinTreatSession).toHaveBeenCalledWith(
      'token_demo',
      expect.objectContaining({
        sessionId: 'session_1',
        userId: 'u_demo',
        amount: 30,
      }),
    );

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'treat-join-friend'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.joinTreatSession).toHaveBeenCalledWith(
      'token_demo',
      expect.objectContaining({
        sessionId: 'session_1',
        userId: 'u_friend',
        amount: 40,
      }),
    );

    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({testID: 'treat-close'}).props.onPress();
      await flush(4);
    });
    expect(mockApi.closeTreatSession).toHaveBeenCalledWith('token_demo', {
      sessionId: 'session_1',
    });
  });
});
