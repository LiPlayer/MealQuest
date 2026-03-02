export interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  data?: Record<string, any>;
  token?: string;
  headers?: Record<string, string>;
}

export interface MerchantCatalogItem {
  merchantId: string;
}

export type CustomerAuthProvider = 'WECHAT' | 'ALIPAY';

export interface CustomerLoginResponse {
  token: string;
  profile?: {
    userId?: string;
    phone?: string;
  };
}
