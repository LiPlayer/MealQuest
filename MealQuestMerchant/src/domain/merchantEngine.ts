export type TriggerEvent = string;

export interface Campaign {
  id: string;
  name: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  triggerEvent: TriggerEvent;
  condition: {
    field: string;
    equals: string | boolean | number;
  };
  budget: {
    cap: number;
    used: number;
    costPerHit: number;
  };
}

export interface Proposal {
  id: string;
  title: string;
  status: 'PENDING' | 'APPROVED';
  templateId?: string;
  branchId?: string;
  campaignDraft: Campaign;
}

export interface MerchantState {
  merchantId: string;
  merchantName: string;
  killSwitchEnabled: boolean;
  budgetCap: number;
  budgetUsed: number;
  pendingProposals: Proposal[];
  activeCampaigns: Campaign[];
}

export interface CashierInput {
  orderAmount: number;
  voucherValue: number;
  bonusBalance: number;
  principalBalance: number;
}

export interface CashierSettlement {
  deduction: {
    voucher: number;
    bonus: number;
    principal: number;
    external: number;
  };
  payable: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const createInitialMerchantState = (): MerchantState => ({
  merchantId: 'm_store_001',
  merchantName: '探味轩',
  killSwitchEnabled: false,
  budgetCap: 300,
  budgetUsed: 0,
  pendingProposals: [],
  activeCampaigns: [],
});

export const approveProposal = (
  state: MerchantState,
  proposalId: string,
): MerchantState => {
  const proposal = state.pendingProposals.find(item => item.id === proposalId);
  if (!proposal || proposal.status !== 'PENDING') {
    return state;
  }

  return {
    ...state,
    pendingProposals: state.pendingProposals.map(item =>
      item.id === proposalId ? { ...item, status: 'APPROVED' } : item,
    ),
    activeCampaigns: [...state.activeCampaigns, { ...proposal.campaignDraft }],
  };
};

export const toggleKillSwitch = (
  state: MerchantState,
  enabled: boolean,
): MerchantState => ({
  ...state,
  killSwitchEnabled: enabled,
});

export const triggerCampaigns = (
  state: MerchantState,
  event: TriggerEvent,
  context: Record<string, string | boolean | number>,
): { nextState: MerchantState; executedIds: string[]; blockedByKillSwitch: boolean } => {
  if (state.killSwitchEnabled) {
    return {
      nextState: state,
      executedIds: [],
      blockedByKillSwitch: true,
    };
  }

  let totalBudgetUsed = state.budgetUsed;
  const executedIds: string[] = [];

  const updatedCampaigns = state.activeCampaigns.map(campaign => {
    if (campaign.status && campaign.status !== 'ACTIVE') {
      return campaign;
    }
    if (campaign.triggerEvent !== event) {
      return campaign;
    }
    const isMatch = context[campaign.condition.field] === campaign.condition.equals;
    if (!isMatch) {
      return campaign;
    }

    const nextBudget = campaign.budget.used + campaign.budget.costPerHit;
    if (nextBudget > campaign.budget.cap) {
      return campaign;
    }

    executedIds.push(campaign.id);
    totalBudgetUsed += campaign.budget.costPerHit;
    return {
      ...campaign,
      budget: {
        ...campaign.budget,
        used: nextBudget,
      },
    };
  });

  return {
    nextState: {
      ...state,
      budgetUsed: totalBudgetUsed,
      activeCampaigns: updatedCampaigns,
    },
    executedIds,
    blockedByKillSwitch: false,
  };
};

export const smartCashierVerify = (input: CashierInput): CashierSettlement => {
  let remain = input.orderAmount;
  const voucher = Math.min(remain, input.voucherValue);
  remain = roundMoney(remain - voucher);

  const bonus = Math.min(remain, input.bonusBalance);
  remain = roundMoney(remain - bonus);

  const principal = Math.min(remain, input.principalBalance);
  remain = roundMoney(remain - principal);

  return {
    deduction: {
      voucher: roundMoney(voucher),
      bonus: roundMoney(bonus),
      principal: roundMoney(principal),
      external: roundMoney(Math.max(remain, 0)),
    },
    payable: roundMoney(Math.max(remain, 0)),
  };
};
