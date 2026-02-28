import {
  approveProposal,
  createInitialMerchantState,
  smartCashierVerify,
  toggleKillSwitch,
  triggerPolicies,
} from '../src/domain/merchantEngine';

describe('merchantEngine', () => {
  it('approves proposal and activates policy', () => {
    const initial = {
      ...createInitialMerchantState(),
      pendingProposals: [
        {
          id: 'proposal_rainy',
          title: '暴雨急售策略',
          status: 'PENDING' as const,
          policyDraft: {
            id: 'campaign_rainy_hot_soup',
            name: '雨天热汤投放',
            status: 'ACTIVE' as const,
            triggerEvent: 'WEATHER_CHANGE',
            condition: {
              field: 'weather',
              equals: 'RAIN',
            },
            budget: {
              cap: 60,
              used: 0,
              costPerHit: 12,
            },
          },
        },
      ],
    };
    const next = approveProposal(initial, 'proposal_rainy');

    expect(next.activePolicies.length).toBe(1);
    expect(next.activePolicies[0].id).toBe('campaign_rainy_hot_soup');
    expect(next.pendingProposals[0].status).toBe('APPROVED');
  });

  it('blocks trigger when kill switch is enabled', () => {
    const withPolicy = {
      ...createInitialMerchantState(),
      activePolicies: [
        {
          id: 'campaign_rainy_hot_soup',
          name: '雨天热汤投放',
          status: 'ACTIVE' as const,
          triggerEvent: 'WEATHER_CHANGE',
          condition: {
            field: 'weather',
            equals: 'RAIN',
          },
          budget: {
            cap: 60,
            used: 0,
            costPerHit: 12,
          },
        },
      ],
    };
    const killed = toggleKillSwitch(withPolicy, true);
    const result = triggerPolicies(killed, 'WEATHER_CHANGE', {weather: 'RAIN'});

    expect(result.blockedByKillSwitch).toBe(true);
    expect(result.executedIds).toEqual([]);
  });

  it('smart cashier verify follows voucher -> bonus -> principal order', () => {
    const settlement = smartCashierVerify({
      orderAmount: 52,
      voucherValue: 18,
      bonusBalance: 10,
      principalBalance: 20,
    });

    expect(settlement.deduction).toEqual({
      voucher: 18,
      bonus: 10,
      principal: 20,
      external: 4,
    });
    expect(settlement.payable).toBe(4);
  });
});
