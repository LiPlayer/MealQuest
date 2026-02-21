import {
  approveProposal,
  createInitialMerchantState,
  smartCashierVerify,
  toggleKillSwitch,
  triggerCampaigns,
} from '../src/domain/merchantEngine';

describe('merchantEngine', () => {
  it('approves proposal and activates campaign', () => {
    const initial = createInitialMerchantState();
    const next = approveProposal(initial, 'proposal_rainy');

    expect(next.activeCampaigns.length).toBe(1);
    expect(next.activeCampaigns[0].id).toBe('campaign_rainy_hot_soup');
    expect(next.pendingProposals[0].status).toBe('APPROVED');
  });

  it('blocks trigger when kill switch is enabled', () => {
    const withCampaign = approveProposal(createInitialMerchantState(), 'proposal_rainy');
    const killed = toggleKillSwitch(withCampaign, true);
    const result = triggerCampaigns(killed, 'WEATHER_CHANGE', {weather: 'RAIN'});

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
