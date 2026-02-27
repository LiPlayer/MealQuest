export interface RealtimeMessage {
  type: string;
  merchantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export function parseRealtimeMessage(raw: string): RealtimeMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.type !== 'string' ||
      typeof parsed?.merchantId !== 'string' ||
      typeof parsed?.timestamp !== 'string'
    ) {
      return null;
    }
    return {
      type: parsed.type,
      merchantId: parsed.merchantId,
      payload:
        parsed.payload && typeof parsed.payload === 'object'
          ? parsed.payload
          : {},
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

export interface RealtimeClient {
  send: (message: any) => void;
  close: () => void;
}

export function createRealtimeClient({
  wsUrl,
  onMessage,
  onConnect,
  onClose,
  onError,
}: {
  wsUrl: string;
  onMessage: (message: RealtimeMessage) => void;
  onConnect?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}): RealtimeClient {
  // RN runtime provides WebSocket. In unsupported runtime, fail gracefully.
  if (typeof WebSocket === 'undefined') {
    onError?.(new Error('WebSocket is not available in current runtime'));
    return { send: () => { }, close: () => { } };
  }

  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    onConnect?.();
  };

  socket.onmessage = event => {
    const raw = String(event.data || '');
    const parsed = parseRealtimeMessage(raw);
    if (parsed) {
      onMessage(parsed);
    }
  };

  socket.onerror = () => {
    onError?.(new Error('websocket connection error'));
  };

  socket.onclose = () => {
    onClose?.();
  };

  return {
    send: (message: any) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    close: () => {
      try {
        socket.close();
      } catch {
        // ignore close error
      }
    },
  };
}
