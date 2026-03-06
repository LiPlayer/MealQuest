export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  data?: Record<string, any>;
  token?: string;
  headers?: Record<string, string>;
}

export type CustomerAuthProvider = 'WECHAT' | 'ALIPAY';
