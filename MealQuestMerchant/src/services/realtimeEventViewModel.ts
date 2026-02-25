import {RealtimeMessage} from './merchantRealtime';

export type RealtimeSeverity = 'info' | 'warn' | 'error';

export interface RealtimeEventRow {
  id: string;
  type: string;
  label: string;
  severity: RealtimeSeverity;
  summary: string;
  detail: string;
  isAnomaly: boolean;
}

const EVENT_META: Record<
  string,
  {label: string; severity: RealtimeSeverity; isAnomaly: boolean}
> = {
  PAYMENT_VERIFIED: {
    label: '支付完成',
    severity: 'info',
    isAnomaly: false,
  },
  PAYMENT_REFUNDED: {
    label: '发生退款',
    severity: 'warn',
    isAnomaly: true,
  },
  PROPOSAL_CONFIRMED: {
    label: '策略确认',
    severity: 'info',
    isAnomaly: false,
  },
  KILL_SWITCH_CHANGED: {
    label: '熔断变更',
    severity: 'warn',
    isAnomaly: true,
  },
  TCA_TRIGGERED: {
    label: '策略触发',
    severity: 'info',
    isAnomaly: false,
  },
  CAMPAIGN_STATUS_CHANGED: {
    label: '活动状态变更',
    severity: 'warn',
    isAnomaly: true,
  },
  FIRE_SALE_CREATED: {
    label: '紧急急售上线',
    severity: 'warn',
    isAnomaly: true,
  },
  SYSTEM_WS_CONNECTED: {
    label: '实时连接',
    severity: 'info',
    isAnomaly: false,
  },
  SYSTEM_WS_ERROR: {
    label: '连接异常',
    severity: 'error',
    isAnomaly: true,
  },
};

function getMeta(type: string) {
  return (
    EVENT_META[type] || {
      label: type,
      severity: 'info' as const,
      isAnomaly: false,
    }
  );
}

function toTimeLabel(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }
  return date.toLocaleTimeString('zh-CN', {hour12: false});
}

function stringifyPayload(payload: Record<string, unknown>) {
  const entries = Object.entries(payload || {});
  if (entries.length === 0) {
    return '无 payload';
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return 'payload 解析失败';
  }
}

export function buildRealtimeEventRow(message: RealtimeMessage): RealtimeEventRow {
  const meta = getMeta(message.type);
  const time = toTimeLabel(message.timestamp);
  return {
    id: `${message.timestamp}-${message.type}`,
    type: message.type,
    label: meta.label,
    severity: meta.severity,
    isAnomaly: meta.isAnomaly,
    summary: `[${time}] ${meta.label}`,
    detail: stringifyPayload(message.payload),
  };
}

export function buildSystemEventRow({
  type,
  detail,
  timestamp = new Date().toISOString(),
}: {
  type: 'SYSTEM_WS_CONNECTED' | 'SYSTEM_WS_ERROR';
  detail: string;
  timestamp?: string;
}): RealtimeEventRow {
  const meta = getMeta(type);
  const time = toTimeLabel(timestamp);
  return {
    id: `${timestamp}-${type}`,
    type,
    label: meta.label,
    severity: meta.severity,
    isAnomaly: meta.isAnomaly,
    summary: `[${time}] ${meta.label}`,
    detail,
  };
}
