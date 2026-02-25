import { MerchantState } from '../../domain/merchantEngine';

interface MerchantStatePayload {
  dashboard: any;
  campaigns: any[];
  proposals?: any[];
}

export function toMerchantState(payload: MerchantStatePayload): MerchantState {
  const pendingFromState = (payload.proposals || []).filter((item: any) => item.status === 'PENDING');
  const pending =
    pendingFromState.length > 0
      ? pendingFromState.map((item: any) => ({
          id: item.id,
          title: item.title,
          status: 'PENDING' as const,
          templateId: item.strategyMeta?.templateId,
          branchId: item.strategyMeta?.branchId,
          campaignDraft: {
            id: item.suggestedCampaign?.id || `${item.id}_draft`,
            name: item.suggestedCampaign?.name || item.title,
            triggerEvent:
              item.suggestedCampaign?.trigger?.event ||
              item.suggestedCampaign?.triggerEvent ||
              'WEATHER_CHANGE',
            condition: {
              field: item.suggestedCampaign?.conditions?.[0]?.field || 'weather',
              equals:
                item.suggestedCampaign?.conditions?.[0]?.value ??
                item.suggestedCampaign?.conditions?.[0]?.equals ??
                'RAIN',
            },
            budget: {
              cap: Number(item.suggestedCampaign?.budget?.cap || 0),
              used: Number(item.suggestedCampaign?.budget?.used || 0),
              costPerHit: Number(item.suggestedCampaign?.budget?.costPerHit || 0),
            },
          },
        }))
      : (payload.dashboard.pendingProposals || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          status: 'PENDING' as const,
          campaignDraft: {
            id: `${item.id}_draft`,
            name: item.title,
            triggerEvent: 'WEATHER_CHANGE' as const,
            condition: { field: 'weather', equals: 'RAIN' },
            budget: { cap: 0, used: 0, costPerHit: 0 },
          },
        }));

  return {
    merchantId: payload.dashboard.merchantId,
    merchantName: payload.dashboard.merchantName,
    killSwitchEnabled: Boolean(payload.dashboard.killSwitchEnabled),
    budgetCap: Number(payload.dashboard.budgetCap || 0),
    budgetUsed: Number(payload.dashboard.budgetUsed || 0),
    pendingProposals: pending,
    activeCampaigns: (payload.campaigns || []).map((campaign: any) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status || 'ACTIVE',
      triggerEvent: campaign.trigger?.event || 'WEATHER_CHANGE',
      condition: {
        field: campaign.conditions?.[0]?.field || 'weather',
        equals: campaign.conditions?.[0]?.value ?? campaign.conditions?.[0]?.equals ?? 'RAIN',
      },
      budget: {
        cap: Number(campaign.budget?.cap || 0),
        used: Number(campaign.budget?.used || 0),
        costPerHit: Number(campaign.budget?.costPerHit || 0),
      },
    })),
  };
}
