import Taro from '@tarojs/taro';

import { CustomerAuthProvider } from './contracts';

export const DEFAULT_THEME = {
  primaryColor: '#FFB100',
  secondaryColor: '#FFF8E1',
  backgroundColor: '#FAFAFA',
};

export const DEFAULT_ACTIVITIES = [
  {
    id: 'remote_rainy',
    title: '雨天热汤补给',
    desc: '服务端策略触发，实时下发口福红包',
    icon: '🌧️',
    color: 'bg-blue-50',
    textColor: 'text-blue-600',
    tag: 'TCA',
  },
  {
    id: 'remote_recharge',
    title: '聚宝金库限时礼',
    desc: '充值立享赠送金，支持智能抵扣',
    icon: '💰',
    color: 'bg-amber-50',
    textColor: 'text-amber-600',
    tag: 'HOT',
  },
];

export const getEnv = (name: string): string => {
  if (typeof process === 'undefined' || !process.env) {
    return '';
  }
  const value = process.env[name];
  return typeof value === 'string' ? value : '';
};

export const getServerBaseUrl = () => {
  return getEnv('TARO_APP_SERVER_URL').trim();
};

export const resolveCustomerAuthProvider = (): CustomerAuthProvider => {
  const taroEnv =
    typeof (Taro as any).getEnv === 'function'
      ? String((Taro as any).getEnv() || '').trim().toUpperCase()
      : '';
  if (taroEnv.includes('ALIPAY')) {
    return 'ALIPAY';
  }
  if (taroEnv.includes('WEAPP') || taroEnv.includes('WECHAT')) {
    return 'WECHAT';
  }

  const buildEnv = getEnv('TARO_ENV').trim().toUpperCase();
  if (buildEnv === 'ALIPAY') {
    return 'ALIPAY';
  }
  return 'WECHAT';
};
