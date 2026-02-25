import { getBaseUrl } from './runtime';

type HttpMethod = 'GET' | 'POST';

class ApiError extends Error {
  status: number;
  path: string;
  payload: unknown;

  constructor(message: string, status: number, path: string, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.payload = payload;
  }
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function pickErrorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
    if (typeof data.raw === 'string' && data.raw.trim()) {
      return `HTTP ${status}: ${data.raw.slice(0, 200)}`;
    }
  }
  return `HTTP ${status}`;
}

function logApiDebug(stage: 'REQ' | 'RES' | 'ERR', detail: Record<string, unknown>) {
  if (!__DEV__) {
    return;
  }
  // Keep debug logs concise and avoid leaking auth token.
  console.log(`[MerchantApi][${stage}]`, JSON.stringify(detail));
}

export async function requestJson<T>(
  method: HttpMethod,
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<T> {
  logApiDebug('REQ', {
    method,
    path,
    hasToken: Boolean(token),
    body: body || null,
  });

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await parseJsonOrText(response);
  if (!response.ok) {
    logApiDebug('ERR', {
      method,
      path,
      status: response.status,
      payload: data,
    });
    throw new ApiError(pickErrorMessage(response.status, data), response.status, path, data);
  }
  logApiDebug('RES', {
    method,
    path,
    status: response.status,
    payload: data,
  });
  return data as T;
}

export async function requestPublicJson<T>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  logApiDebug('REQ', {
    method,
    path,
    hasToken: false,
    body: body || null,
  });

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await parseJsonOrText(response);
  if (!response.ok) {
    logApiDebug('ERR', {
      method,
      path,
      status: response.status,
      payload: data,
    });
    throw new ApiError(pickErrorMessage(response.status, data), response.status, path, data);
  }
  logApiDebug('RES', {
    method,
    path,
    status: response.status,
    payload: data,
  });
  return data as T;
}
