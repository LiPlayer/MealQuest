import Taro from '@tarojs/taro';

import { RequestOptions } from './contracts';
import { getServerBaseUrl } from './env';

export const requestJson = async ({ method, path, data, token }: RequestOptions) => {
  const baseUrl = getServerBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing TARO_APP_SERVER_URL');
  }

  const response = await Taro.request({
    method,
    url: `${baseUrl}${path}`,
    data,
    header: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.statusCode >= 400) {
    const error = (response.data as any)?.error || `HTTP ${response.statusCode}`;
    throw new Error(error);
  }

  return response.data as any;
};
