import { MerchantState } from '../../domain/merchantEngine';

interface MerchantStatePayload {
  dashboard: any;
  campaigns: any[];
  proposals?: any[];
}

function getTriggerEventFromPolicySpec(spec: any): string {
  if (!spec || !Array.isArray(spec.triggers) || spec.triggers.length === 0) {
    return 'WEATHER_CHANGE';
  }
  const first = spec.triggers[0] || {};
  return String(first.event || first?.params?.event || 'WEATHER_CHANGE').toUpperCase();
}

function getFirstConditionFromPolicySpec(spec: any): { field: string; equals: string | boolean | number } {
  const conditions = spec?.segment?.params?.conditions;
  const first = Array.isArray(conditions) ? conditions[0] : null;
  return {
    field: String(first?.field || 'weather'),
    equals: first?.value ?? first?.equals ?? 'RAIN',
  };
}

function getBudgetFromPolicySpec(spec: any): { cap: number; used: number; costPerHit: number } {
  const constraints = Array.isArray(spec?.constraints) ? spec.constraints : [];
  const budgetGuard = constraints.find((item: any) => item?.plugin === 'budget_guard_v1');
  return {
    cap: Number(budgetGuard?.params?.cap || 0),
    used: 0,
    costPerHit: Number(budgetGuard?.params?.cost_per_hit || 0),
  };
}

export function toMerchantState(payload: MerchantStatePayload): MerchantState {
  const pendingFromState = (payload.proposals || []).filter((item: any) => item.status === 'PENDING');
  const approvedPendingPublish = (payload.proposals || [])
    .filter((item: any) => item.status === 'APPROVED' && !(item.policyWorkflow && item.policyWorkflow.policyId))
    .map((item: any) => ({
      id: item.id,
      title: item.title,
      draftId: item.policyWorkflow?.draftId || null,
      approvalId: item.policyWorkflow?.approvalId || null,
      approvedAt: item.approvedAt || null,
    }));
  const pending =
    pendingFromState.length > 0
      ? pendingFromState.map((item: any) => ({
          id: item.id,
          title: item.title,
          status: 'PENDING' as const,
          templateId: item.strategyMeta?.templateId,
          branchId: item.strategyMeta?.branchId,
          campaignDraft: {
            id: item.policyWorkflow?.draftId || `${item.id}_draft`,
            name: item.suggestedPolicySpec?.name || item.title,
            triggerEvent: getTriggerEventFromPolicySpec(item.suggestedPolicySpec),
            condition: getFirstConditionFromPolicySpec(item.suggestedPolicySpec),
            budget: getBudgetFromPolicySpec(item.suggestedPolicySpec),
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
    approvedPendingPublish,
    activeCampaigns: (payload.campaigns || []).map((campaign: any) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status || 'ACTIVE',
      triggerEvent:
        campaign.trigger?.event ||
        getTriggerEventFromPolicySpec(campaign) ||
        'WEATHER_CHANGE',
      condition:
        (campaign.conditions && campaign.conditions.length > 0
          ? {
              field: campaign.conditions[0]?.field || 'weather',
              equals: campaign.conditions[0]?.value ?? campaign.conditions[0]?.equals ?? 'RAIN',
            }
          : getFirstConditionFromPolicySpec(campaign)),
      budget:
        campaign.budget
          ? {
              cap: Number(campaign.budget?.cap || 0),
              used: Number(campaign.budget?.used || 0),
              costPerHit: Number(campaign.budget?.costPerHit || 0),
            }
          : getBudgetFromPolicySpec(campaign),
    })),
  };
}
