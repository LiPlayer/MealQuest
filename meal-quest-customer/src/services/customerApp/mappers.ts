import {
  ActivityItem,
  GameTouchpointItem,
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

export function toFriendlyReasonLabel(reasonCode: string): string {
  const normalized = toString(reasonCode).trim();
  if (!normalized) {
    return '';
  }
  return REASON_FRIENDLY_MAP[normalized] || '暂未命中当前活动条件';
}

const LIFECYCLE_STAGE_ALIASES: Record<string, string> = {
  WELCOME: '获客',
  NEW: '获客',
  ACQUISITION: '获客',
  '获客': '获客',
  ACTIVATION: '激活',
  HOT: '激活',
  '激活': '激活',
  ENGAGEMENT: '活跃',
  PLAY: '活跃',
  '活跃': '活跃',
  REVENUE: '扩收',
  EXPANSION: '扩收',
  PAY: '扩收',
  '扩展收入': '扩收',
  '扩收': '扩收',
  RETENTION: '留存',
  CARE: '留存',
  '留存': '留存',
};

function inferLifecycleStage(value: string): string {
  const normalized = toString(value).toUpperCase();
  if (!normalized) {
    return '触达';
  }
  const exact = LIFECYCLE_STAGE_ALIASES[normalized];
  if (exact) {
    return exact;
  }
  const raw = toString(value);
  if (raw && LIFECYCLE_STAGE_ALIASES[raw]) {
    return LIFECYCLE_STAGE_ALIASES[raw];
  }
  return '触达';
}

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
    return toFriendlyReasonLabel(reasonCode);
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
  const stageSource = toString(raw.stage) || toString(raw.tag, 'AI');
  const stage = inferLifecycleStage(stageSource || inferStageByTag(toString(raw.tag, 'AI')));
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

function mapGameTouchpoint(raw: Record<string, unknown>, index: number): GameTouchpointItem {
  const rewardRaw =
    raw.reward && typeof raw.reward === 'object'
      ? (raw.reward as Record<string, unknown>)
      : {};
  const rewardLabel =
    toString(raw.rewardLabel) ||
    toString(rewardRaw.name) ||
    toString(rewardRaw.title) ||
    toString(rewardRaw.type);
  const stage = inferLifecycleStage(toString(raw.stage) || toString(raw.tag));
  const outcome =
    inferOutcomeByTitle(toString(raw.title) || toString(raw.desc)) || 'INFO';
  return {
    touchpointId: toString(raw.id || raw.touchpointId || `game_touchpoint_${index + 1}`),
    title: toString(raw.title, '小游戏互动'),
    desc: toString(raw.desc || raw.explanation, '完成互动后可查看奖励到账情况。'),
    stage: stage === '触达' ? undefined : stage,
    outcome,
    rewardLabel: rewardLabel || undefined,
    updatedAt: toString(raw.updatedAt || raw.createdAt || raw.timestamp) || undefined,
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
  const rawGameAssets =
    stateData.gameAssets && typeof stateData.gameAssets === 'object'
      ? (stateData.gameAssets as Record<string, unknown>)
      : {};
  const rawCollectibles = Array.isArray(rawGameAssets.collectibles) ? rawGameAssets.collectibles : [];
  const rawUnlockedGames = Array.isArray(rawGameAssets.unlockedGames) ? rawGameAssets.unlockedGames : [];
  const rawGameSummary =
    rawGameAssets.summary && typeof rawGameAssets.summary === 'object'
      ? (rawGameAssets.summary as Record<string, unknown>)
      : {};
  const rawGameTouchpoints = Array.isArray(stateData.gameTouchpoints) ? stateData.gameTouchpoints : [];
  const gameTouchpoints = rawGameTouchpoints.map((item, index) =>
    mapGameTouchpoint((item || {}) as Record<string, unknown>, index),
  );
  const collectibleCount = Number(rawGameSummary.collectibleCount) || rawCollectibles.length;
  const unlockedGameCount = Number(rawGameSummary.unlockedGameCount) || rawUnlockedGames.length;

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
    gameSummary: {
      collectibleCount: Number.isFinite(collectibleCount) ? collectibleCount : 0,
      unlockedGameCount: Number.isFinite(unlockedGameCount) ? unlockedGameCount : 0,
      touchpointCount: gameTouchpoints.length,
    },
    gameTouchpoints,
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
