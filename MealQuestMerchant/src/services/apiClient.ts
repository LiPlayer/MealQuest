import { Platform } from 'react-native';
import Config from 'react-native-config';

export type MerchantProfile = {
  role: string;
  merchantId: string | null;
  phone: string;
};

export type MerchantPhoneLoginResult =
  | {
    status: 'BOUND';
    token: string;
    profile: MerchantProfile;
    merchant: {
      merchantId: string;
      name: string;
      ownerPhone?: string;
    };
  }
  | {
    status: 'ONBOARD_REQUIRED';
    onboardingToken: string;
    profile: MerchantProfile;
  };

export type MerchantCompleteOnboardResult = {
  status: 'BOUND';
  token: string;
  profile: MerchantProfile;
  merchant: {
    merchantId: string;
    name: string;
    ownerPhone?: string;
  };
};

export type ChatStreamPayload = {
  context: {
    merchantId: string;
    sessionId?: string;
  };
  input: {
    messages: Array<{
      role: 'user';
      content: string;
    }>;
  };
  streamMode?: string[];
};

export type ChatStreamEvent = {
  event: string;
  data: unknown;
};

const DEFAULT_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3030',
  default: 'http://127.0.0.1:3030',
});

export function getApiBaseUrl(): string {
  const envUrl = typeof Config.MQ_SERVER_URL === 'string' ? Config.MQ_SERVER_URL.trim() : '';
  return envUrl || String(DEFAULT_BASE_URL || 'http://127.0.0.1:3030');
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  options: { token?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data.error === 'string' ? data.error : `request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function requestMerchantPhoneCode(phone: string): Promise<void> {
  await postJson('/api/auth/merchant/request-code', { phone });
}

export async function loginMerchantByPhone(params: {
  phone: string;
  code: string;
}): Promise<MerchantPhoneLoginResult> {
  return postJson<MerchantPhoneLoginResult>('/api/auth/merchant/phone-login', {
    phone: params.phone,
    code: params.code,
  });
}

export async function completeMerchantOnboard(params: {
  onboardingToken: string;
  name: string;
}): Promise<MerchantCompleteOnboardResult> {
  return postJson<MerchantCompleteOnboardResult>(
    '/api/auth/merchant/complete-onboard',
    {
      name: params.name,
    },
    { token: params.onboardingToken },
  );
}

function parseSseChunk(
  chunk: string,
  state: {
    eventName: string;
    dataLines: string[];
    buffer: string;
  },
  onEvent: (event: ChatStreamEvent) => void,
): void {
  state.buffer += chunk;
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line) {
      if (state.dataLines.length === 0) {
        state.eventName = 'message';
        continue;
      }
      const rawData = state.dataLines.join('\n');
      let parsed: unknown = rawData;
      try {
        parsed = JSON.parse(rawData);
      } catch {
        parsed = rawData;
      }
      onEvent({
        event: state.eventName || 'message',
        data: parsed,
      });
      state.eventName = 'message';
      state.dataLines = [];
      continue;
    }
    if (line.startsWith('event:')) {
      state.eventName = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      state.dataLines.push(line.slice(5).trim());
    }
  }
}

export async function streamMerchantChat(params: {
  token: string;
  payload: ChatStreamPayload;
  onEvent: (event: ChatStreamEvent) => void;
}): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const state = {
    eventName: 'message',
    dataLines: [] as string[],
    buffer: '',
  };
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let consumed = 0;

    xhr.open('POST', `${baseUrl}/api/merchant/chat/stream`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${params.token}`);
    xhr.timeout = 120000;

    xhr.onprogress = () => {
      const full = String(xhr.responseText || '');
      if (full.length <= consumed) {
        return;
      }
      const chunk = full.slice(consumed);
      consumed = full.length;
      parseSseChunk(chunk, state, params.onEvent);
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) {
        return;
      }
      const tail = String(xhr.responseText || '').slice(consumed);
      if (tail) {
        parseSseChunk(tail, state, params.onEvent);
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `request failed (${xhr.status})`;
      try {
        const parsed = JSON.parse(String(xhr.responseText || '{}'));
        if (parsed && typeof parsed.error === 'string') {
          message = parsed.error;
        }
      } catch {
        // ignore
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error('network request failed'));
    xhr.ontimeout = () => reject(new Error('request timeout'));
    xhr.send(JSON.stringify(params.payload));
  });
}
