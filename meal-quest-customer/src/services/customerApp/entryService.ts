type IntentOptions = Record<string, unknown>;

export interface StartupIntent {
  merchantId: string;
  autoPay: boolean;
  orderAmount: number | null;
}

const PAY_FLAGS = new Set(['1', 'true', 'yes', 'on', 'pay', 'payment']);

function decodeSafe(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function isValidMerchantId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{2,64}$/.test(value);
}

function parseOrderAmount(raw: string): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function setIntentFromKeyValue(intent: StartupIntent, keyRaw: string, valueRaw: string): void {
  const key = String(keyRaw || '').trim().toLowerCase();
  const value = decodeSafe(String(valueRaw || '').trim());
  if (!key) {
    return;
  }

  if (key === 'id' || key === 'storeid' || key === 'merchantid') {
    if (!intent.merchantId && isValidMerchantId(value)) {
      intent.merchantId = value;
    }
    return;
  }

  if (key === 'scene') {
    applyRawIntent(intent, value);
    return;
  }

  if (key === 'pay' || key === 'autopay' || key === 'openpay') {
    if (PAY_FLAGS.has(value.toLowerCase())) {
      intent.autoPay = true;
    }
    return;
  }

  if (key === 'action' || key === 'page') {
    if (value.toLowerCase().includes('pay')) {
      intent.autoPay = true;
    }
    return;
  }

  if (key === 'amount' || key === 'orderamount' || key === 'payamount') {
    const amount = parseOrderAmount(value);
    if (amount !== null) {
      intent.orderAmount = amount;
    }
  }
}

function applyUrlIntent(intent: StartupIntent, decoded: string): boolean {
  try {
    const parsed = new URL(decoded);
    parsed.searchParams.forEach((value, key) => setIntentFromKeyValue(intent, key, value));

    const tail = decodeSafe(parsed.pathname.split('/').filter(Boolean).pop() || '');
    if (!intent.merchantId && isValidMerchantId(tail)) {
      intent.merchantId = tail;
    }
    return true;
  } catch {
    return false;
  }
}

function applyQueryIntent(intent: StartupIntent, decoded: string): void {
  if (!(decoded.includes('?') || decoded.includes('=') || decoded.includes('&'))) {
    return;
  }
  const queryPart = decoded.includes('?') ? decoded.split('?').slice(1).join('?') : decoded;
  const params = new URLSearchParams(queryPart);
  params.forEach((value, key) => setIntentFromKeyValue(intent, key, value));
}

function applyTailSegmentIntent(intent: StartupIntent, decoded: string): void {
  const tailMatch = decoded.match(/\/([a-zA-Z0-9_-]{2,64})$/);
  if (!intent.merchantId && tailMatch && tailMatch[1]) {
    intent.merchantId = tailMatch[1];
  }
}

export function applyRawIntent(intent: StartupIntent, input: string): void {
  const raw = String(input || '').trim();
  if (!raw) {
    return;
  }
  const decoded = decodeSafe(raw);

  if (!intent.merchantId && isValidMerchantId(decoded)) {
    intent.merchantId = decoded;
    return;
  }

  const isAbsoluteUrl = applyUrlIntent(intent, decoded);
  if (!isAbsoluteUrl) {
    applyQueryIntent(intent, decoded);
    applyTailSegmentIntent(intent, decoded);
  }
}

export function resolveStartupIntent(entryInput: string, options: IntentOptions = {}): StartupIntent {
  const intent: StartupIntent = {
    merchantId: '',
    autoPay: false,
    orderAmount: null,
  };

  applyRawIntent(intent, entryInput);

  const keys = [
    'id',
    'storeId',
    'merchantId',
    'scene',
    'action',
    'page',
    'pay',
    'autoPay',
    'openPay',
    'amount',
    'orderAmount',
    'payAmount',
  ];
  for (const key of keys) {
    const value = options[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    setIntentFromKeyValue(intent, key, String(value));
  }

  return intent;
}

export function toIndexUrl(intent: StartupIntent): string {
  if (!intent.autoPay) {
    return '/pages/index/index';
  }
  const query = ['autoPay=1'];
  if (intent.orderAmount !== null) {
    query.push(`orderAmount=${encodeURIComponent(String(intent.orderAmount))}`);
  }
  return `/pages/index/index?${query.join('&')}`;
}
