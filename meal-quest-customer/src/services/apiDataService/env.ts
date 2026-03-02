import Taro from '@tarojs/taro';

import { CustomerAuthProvider } from './contracts';

export const DEFAULT_THEME = {
  primaryColor: '#FFB100',
  secondaryColor: '#FFF8E1',
  backgroundColor: '#FAFAFA',
};

export const DEFAULT_ACTIVITIES = [];

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

