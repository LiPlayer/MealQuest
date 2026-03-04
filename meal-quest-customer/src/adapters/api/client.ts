import Taro from '@tarojs/taro';

import { getServerBaseUrl } from '@/services/apiDataService/env';

export type ApiRequestOptions = {
  method: 'GET' | 'POST';
  path: string;
  data?: Record<string, unknown>;
  token?: string;
  headers?: Record<string, string>;
};

export const apiRequestJson = async <T>({
  method,
  path,
  data,
  token,
  headers,
}: ApiRequestOptions): Promise<T> => {
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
      ...(headers || {}),
    },
  });

  if (response.statusCode >= 400) {
    const error = (response.data as Record<string, unknown>)?.error;
    throw new Error(typeof error === 'string' ? error : `HTTP ${response.statusCode}`);
  }

  return response.data as T;
};
