import { HomeSnapshot, StoreData } from '../dataTypes';
import { DEFAULT_THEME } from './env';

export const toStoreData = (merchant: any): StoreData => ({
  id: merchant.merchantId,
  name: merchant.name,
  branchName: '默认门店',
  slogan: '支付不是结束，而是资产关系的开始',
  logo: 'https://api.dicebear.com/9.x/icons/svg?seed=MealQuest',
  theme: DEFAULT_THEME,
  isOpen: true,
});

export const toHomeSnapshot = (stateData: any): HomeSnapshot => ({
  store: toStoreData(stateData.merchant),
  wallet: {
    principal: Number(stateData.user.wallet.principal || 0),
    bonus: Number(stateData.user.wallet.bonus || 0),
    silver: Number(stateData.user.wallet.silver || 0),
  },
  fragments: {
    common: Number(stateData.user.fragments?.noodle || 0),
    rare: Number(stateData.user.fragments?.spicy || 0),
  },
  vouchers: (stateData.user.vouchers || []).map((voucher: any) => ({
    id: voucher.id,
    name: voucher.name,
    value: Number(voucher.value || 0),
    minSpend: Number(voucher.minSpend || 0),
    status: voucher.status,
    expiresAt: voucher.expiresAt,
  })),
  activities:
    Array.isArray(stateData.activities) && stateData.activities.length > 0
      ? stateData.activities.map((item: any) => ({
          id: item.id,
          title: item.title,
          desc: item.desc,
          icon: item.icon || '✨',
          color: item.color || 'bg-slate-50',
          textColor: item.textColor || 'text-slate-600',
          tag: item.tag || 'AI',
        }))
      : [],
});
