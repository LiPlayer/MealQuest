import { HomeSnapshot, InvoiceItem, PaymentLedgerItem, StoreData, Voucher } from '@/services/dataTypes';

import { DEFAULT_THEME } from '@/services/apiDataService/env';

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
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
    activities: rawActivities.map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        id: toString(row.id),
        title: toString(row.title, '活动'),
        desc: toString(row.desc, '欢迎使用 MealQuest'),
        icon: toString(row.icon, '*'),
        color: toString(row.color, 'bg-slate-50'),
        textColor: toString(row.textColor, 'text-slate-600'),
        tag: toString(row.tag, 'AI'),
      };
    }),
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
