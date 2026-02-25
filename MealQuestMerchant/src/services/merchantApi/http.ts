import { getBaseUrl } from './runtime';

type HttpMethod = 'GET' | 'POST';

export async function requestJson<T>(
  method: HttpMethod,
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

export async function requestPublicJson<T>(
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}
