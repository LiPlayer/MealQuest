import Config from 'react-native-config';

const BASE_URL = Config.MQ_SERVER_URL;
const DEFAULT_MERCHANT_ID = '';

if (!BASE_URL) {
  console.warn('[MerchantApi] MQ_SERVER_URL is missing. API calls will fail.');
}

let runtimeMerchantId = DEFAULT_MERCHANT_ID;

export function getBaseUrl() {
  return BASE_URL;
}

export function isConfigured() {
  return Boolean(BASE_URL);
}

export function getMerchantId() {
  return runtimeMerchantId;
}

export function setMerchantId(merchantId: string) {
  runtimeMerchantId = String(merchantId || '').trim() || DEFAULT_MERCHANT_ID;
  return runtimeMerchantId;
}
