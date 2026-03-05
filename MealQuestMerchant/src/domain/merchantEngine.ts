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

export interface MerchantState {
  merchantId: string;
  merchantName: string;
  killSwitchEnabled: boolean;
  budgetCap: number;
  budgetUsed: number;
  activePolicies: ActivePolicy[];
  customerEntry: {
    totalCustomers: number;
    newCustomersToday: number;
    checkinsToday: number;
    latestCheckinAt: string | null;
  };
  acquisitionWelcomeSummary: {
    hitCount24h: number;
    blockedCount24h: number;
    topBlockedReasons: {
      reason: string;
      count: number;
    }[];
    latestResults: {
      decisionId: string;
      event: string;
      outcome: string;
      reasonCode: string;
      createdAt: string;
    }[];
  };
  gameMarketingSummary: {
    hitCount24h: number;
    blockedCount24h: number;
    topBlockedReasons: {
      reason: string;
      count: number;
    }[];
    latestResults: {
      decisionId: string;
      event: string;
      outcome: string;
      reasonCode: string;
      createdAt: string;
    }[];
  };
  traceSummary: {
    last24h: {
      payments: number;
      ledgerRows: number;
      invoices: number;
      audits: number;
      policyDecisions: number;
      traceLinkedPayments: number;
      tracePendingPayments: number;
    };
    latestTrace: {
      paymentTxnId: string;
      userId: string;
      status: string;
      createdAt: string;
      chainComplete: boolean;
      hasLedger: boolean;
      hasInvoice: boolean;
      hasAudit: boolean;
    }[];
  };
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
  activePolicies: [],
  customerEntry: {
    totalCustomers: 0,
    newCustomersToday: 0,
    checkinsToday: 0,
    latestCheckinAt: null,
  },
  acquisitionWelcomeSummary: {
    hitCount24h: 0,
    blockedCount24h: 0,
    topBlockedReasons: [],
    latestResults: [],
  },
  gameMarketingSummary: {
    hitCount24h: 0,
    blockedCount24h: 0,
    topBlockedReasons: [],
    latestResults: [],
  },
  traceSummary: {
    last24h: {
      payments: 0,
      ledgerRows: 0,
      invoices: 0,
      audits: 0,
      policyDecisions: 0,
      traceLinkedPayments: 0,
      tracePendingPayments: 0,
    },
    latestTrace: [],
  },
});

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
