export type TriggerEvent = string;

export interface ActivePolicy {
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
  policyDraft: ActivePolicy;
}

export interface ApprovedProposal {
  id: string;
  title: string;
  draftId: string | null;
  approvalId: string | null;
  approvedAt: string | null;
}

export interface MerchantState {
  merchantId: string;
  merchantName: string;
  killSwitchEnabled: boolean;
  budgetCap: number;
  budgetUsed: number;
  pendingProposals: Proposal[];
  approvedPendingPublish: ApprovedProposal[];
  activePolicies: ActivePolicy[];
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
  merchantId: '',
  merchantName: 'New Store',
  killSwitchEnabled: false,
  budgetCap: 0,
  budgetUsed: 0,
  pendingProposals: [],
  approvedPendingPublish: [],
  activePolicies: [],
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
    activePolicies: [...state.activePolicies, { ...proposal.policyDraft }],
  };
};

export const toggleKillSwitch = (
  state: MerchantState,
  enabled: boolean,
): MerchantState => ({
  ...state,
  killSwitchEnabled: enabled,
});

export const triggerPolicies = (
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

  const updatedPolicies = state.activePolicies.map(policy => {
    if (policy.status && policy.status !== 'ACTIVE') {
      return policy;
    }
    if (policy.triggerEvent !== event) {
      return policy;
    }
    const isMatch = context[policy.condition.field] === policy.condition.equals;
    if (!isMatch) {
      return policy;
    }

    const nextBudget = policy.budget.used + policy.budget.costPerHit;
    if (nextBudget > policy.budget.cap) {
      return policy;
    }

    executedIds.push(policy.id);
    totalBudgetUsed += policy.budget.costPerHit;
    return {
      ...policy,
      budget: {
        ...policy.budget,
        used: nextBudget,
      },
    };
  });

  return {
    nextState: {
      ...state,
      budgetUsed: totalBudgetUsed,
      activePolicies: updatedPolicies,
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

