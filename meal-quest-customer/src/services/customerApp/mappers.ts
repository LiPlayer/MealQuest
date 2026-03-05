import {
  ActivityItem,
  HomeSnapshot,
  InvoiceItem,
  PaymentLedgerItem,
  StoreData,
  TouchpointContract,
  TouchpointItem,
  Voucher,
} from '@/services/dataTypes';

import { DEFAULT_THEME } from '@/services/apiDataService/env';

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

const TOUCHPOINT_OBJECTIVE_LABEL = '触达以长期价值为导向，系统会根据行为与规则反馈是否命中权益。';
const TOUCHPOINT_BEHAVIOR_SIGNALS = ['扫码入店', '活动触达', '支付核销', '账票查询'];

const REASON_FRIENDLY_MAP: Record<string, string> = {
  segment_mismatch: '当前条件未满足',
  'constraint:frequency_exceeded': '今日触达次数已达上限',
  'constraint:budget_cap_exceeded': '活动额度已用完',
  'constraint:global_budget_cap_exceeded': '活动额度已用完',
  'constraint:anti_fraud_blocked': '账户状态需进一步校验',
  'constraint:kill_switch': '活动暂时关闭',
};

function inferStageByTag(tag: string): string {
  const normalized = toString(tag).toUpperCase();
  if (normalized === 'WELCOME') {
    return '获客';
  }
  if (normalized === 'ACTIVATION') {
    return '激活';
  }
  if (normalized === 'REVENUE') {
    return '扩展收入';
  }
  if (normalized === 'RETENTION') {
    return '留存';
  }
  return '触达';
}

function inferOutcomeByTitle(title: string): 'HIT' | 'BLOCKED' | 'INFO' {
  const normalized = toString(title);
  if (normalized.includes('未发放') || normalized.includes('未命中') || normalized.includes('未通过')) {
    return 'BLOCKED';
  }
  if (normalized.includes('已发放') || normalized.includes('已到账') || normalized.includes('命中')) {
    return 'HIT';
  }
  return 'INFO';
}

function extractReasonCode(desc: string): string {
  const normalized = toString(desc);
  if (!normalized) {
    return '';
  }
  const match = normalized.match(/原因[:：]\s*(.+)$/);
  if (!match || !match[1]) {
    return '';
  }
  return toString(match[1]);
}

function toFriendlyExplanation({
  desc,
  reasonCode,
  outcome,
}: {
  desc: string;
  reasonCode: string;
  outcome: 'HIT' | 'BLOCKED' | 'INFO';
}): string {
  if (reasonCode) {
    return REASON_FRIENDLY_MAP[reasonCode] || '暂未命中当前活动条件';
  }
  if (outcome === 'HIT') {
    return desc || '本次触达已命中，可在资产与账单查看变更。';
  }
  if (outcome === 'BLOCKED') {
    return desc || '本次触达未命中，请稍后重试。';
  }
  return desc || '系统正在评估触达条件。';
}

function toActivityItem(raw: Record<string, unknown>): ActivityItem {
  const title = toString(raw.title, '活动');
  const desc = toString(raw.desc, '欢迎使用 MealQuest');
  const reasonCode = extractReasonCode(desc);
  const outcome = inferOutcomeByTitle(title);
  const stage = inferStageByTag(toString(raw.tag, 'AI'));
  return {
    id: toString(raw.id),
    title,
    desc,
    explanation: toFriendlyExplanation({
      desc,
      reasonCode,
      outcome,
    }),
    reasonCode: reasonCode || undefined,
    stage,
    outcome,
    icon: toString(raw.icon, '*'),
    color: toString(raw.color, 'bg-slate-50'),
    textColor: toString(raw.textColor, 'text-slate-600'),
    tag: toString(raw.tag, 'AI'),
  };
}

function toTouchpointContract(activities: ActivityItem[]): TouchpointContract {
  const recentTouchpoints: TouchpointItem[] = activities.slice(0, 8).map((item) => ({
    activityId: toString(item.id),
    stage: toString(item.stage, '触达'),
    outcome: item.outcome || 'INFO',
    explanation: toString(item.explanation || item.desc, '系统正在评估触达条件。'),
    reasonCode: item.reasonCode,
  }));

  return {
    objectiveLabel: TOUCHPOINT_OBJECTIVE_LABEL,
    behaviorSignals: [...TOUCHPOINT_BEHAVIOR_SIGNALS],
    recentTouchpoints,
  };
}

export function toStoreData(merchant: Record<string, unknown>): StoreData {
  return {
    id: toString(merchant.merchantId),
    name: toString(merchant.name, 'MealQuest Store'),
    branchName: '默认门店',
    slogan: '支付不是结束，而是资产关系的开始',
    logo: 'https://api.dicebear.com/9.x/icons/svg?seed=MealQuest',
    theme: DEFAULT_THEME,
    isOpen: true,
  };
}

function toVoucher(voucher: Record<string, unknown>): Voucher {
  return {
    id: toString(voucher.id),
    name: toString(voucher.name, '权益券'),
    value: toNumber(voucher.value),
    minSpend: toNumber(voucher.minSpend),
    status: toString(voucher.status, 'ACTIVE'),
    expiresAt: toString(voucher.expiresAt || voucher.expireAt),
    icon: toString(voucher.icon),
  };
}

export function toHomeSnapshot(stateData: Record<string, unknown>): HomeSnapshot {
  const merchant = (stateData.merchant || {}) as Record<string, unknown>;
  const user = (stateData.user || {}) as Record<string, unknown>;
  const wallet = (user.wallet || {}) as Record<string, unknown>;
  const fragments = (user.fragments || {}) as Record<string, unknown>;
  const rawVouchers = Array.isArray(user.vouchers) ? user.vouchers : [];
  const rawActivities = Array.isArray(stateData.activities) ? stateData.activities : [];
  const activities = rawActivities.map((item) => toActivityItem((item || {}) as Record<string, unknown>));

  return {
    store: toStoreData(merchant),
    wallet: {
      principal: toNumber(wallet.principal),
      bonus: toNumber(wallet.bonus),
      silver: toNumber(wallet.silver),
    },
    fragments: {
      common: toNumber(fragments.noodle ?? fragments.common),
      rare: toNumber(fragments.spicy ?? fragments.rare),
    },
    vouchers: rawVouchers.map((item) => toVoucher((item || {}) as Record<string, unknown>)),
    activities,
    touchpointContract: toTouchpointContract(activities),
  };
}

export function toPaymentLedger(items: unknown[], defaults: { merchantId: string; userId: string }): PaymentLedgerItem[] {
  return (Array.isArray(items) ? items : []).map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      txnId: toString(row.txnId),
      merchantId: toString(row.merchantId, defaults.merchantId),
      userId: toString(row.userId, defaults.userId),
      type: toString(row.type, 'PAYMENT') as PaymentLedgerItem['type'],
      amount: toNumber(row.amount),
      timestamp: toString(row.timestamp || row.createdAt, new Date().toISOString()),
      paymentTxnId: toString(
        (row.details as Record<string, unknown> | undefined)?.paymentTxnId || row.paymentTxnId,
      ),
    };
  });
}

export function toInvoices(items: unknown[], defaults: { merchantId: string; userId: string }): InvoiceItem[] {
  return (Array.isArray(items) ? items : []).map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      invoiceNo: toString(row.invoiceNo),
      merchantId: toString(row.merchantId, defaults.merchantId),
      userId: toString(row.userId, defaults.userId),
      paymentTxnId: toString(row.paymentTxnId),
      amount: toNumber(row.amount),
      status: toString(row.status, 'ISSUED'),
      issuedAt: toString(row.issuedAt, new Date().toISOString()),
      title: toString(row.title, 'MealQuest Invoice'),
    };
  });
}
