import { CustomerNotificationItem, TouchpointItem } from '@/services/dataTypes';

import { toFriendlyReasonLabel } from './mappers';

export type ExecutionConsistencyOutcome = 'HIT' | 'BLOCKED' | 'NO_POLICY' | 'INFO';

export interface ExecutionConsistencyRecord {
  notificationId: string;
  title: string;
  stage: string;
  outcome: ExecutionConsistencyOutcome;
  outcomeLabel: string;
  explanation: string;
  reasonCodes: string[];
  createdAt: string;
}

const EVENT_STAGE_MAP: Record<string, string> = {
  PAYMENT_VERIFY: '扩收',
  CHECKIN: '激活',
  APP_OPEN: '活跃',
  USER_REVISIT: '留存',
};

function toString(value: unknown): string {
  return String(value ?? '').trim();
}

function toStringWithFallback(value: unknown, fallback: string): string {
  const text = toString(value);
  return text || fallback;
}

function normalizeOutcome(value: unknown): ExecutionConsistencyOutcome {
  const normalized = toString(value).toUpperCase();
  if (normalized === 'HIT' || normalized === 'BLOCKED' || normalized === 'NO_POLICY') {
    return normalized;
  }
  return 'INFO';
}

function inferOutcomeByTitleOrBody(input: string): ExecutionConsistencyOutcome {
  const text = toString(input);
  if (!text) {
    return 'INFO';
  }
  if (text.includes('已命中')) {
    return 'HIT';
  }
  if (text.includes('未执行') || text.includes('阻断')) {
    return 'BLOCKED';
  }
  if (text.includes('未命中')) {
    return 'NO_POLICY';
  }
  return 'INFO';
}

function toOutcomeLabel(outcome: ExecutionConsistencyOutcome): string {
  if (outcome === 'HIT') {
    return '已命中';
  }
  if (outcome === 'BLOCKED') {
    return '未执行';
  }
  if (outcome === 'NO_POLICY') {
    return '未命中';
  }
  return '进行中';
}

function toStageLabel(eventName: string): string {
  const normalized = toString(eventName).toUpperCase();
  if (!normalized) {
    return '触达';
  }
  return EVENT_STAGE_MAP[normalized] || '触达';
}

function toReasonCodes(item: CustomerNotificationItem): string[] {
  const rows = Array.isArray(item.related?.reasonCodes) ? item.related?.reasonCodes : [];
  return rows.map((code) => toString(code)).filter(Boolean);
}

function toDefaultExplanation(outcome: ExecutionConsistencyOutcome): string {
  if (outcome === 'HIT') {
    return '本次权益已命中，可在资产与账票中查看变更。';
  }
  if (outcome === 'BLOCKED') {
    return '本次权益未执行，当前存在约束条件。';
  }
  if (outcome === 'NO_POLICY') {
    return '本次未命中权益策略，系统会继续按规则评估。';
  }
  return '系统正在评估本次权益触达结果。';
}

function toExplanation(item: CustomerNotificationItem, outcome: ExecutionConsistencyOutcome): string {
  const reasonCodes = toReasonCodes(item);
  if (reasonCodes.length > 0) {
    return reasonCodes
      .map((code) => toFriendlyReasonLabel(code) || '暂未命中当前活动条件')
      .filter(Boolean)
      .join('；');
  }
  const body = toString(item.body);
  if (body) {
    return body;
  }
  return toDefaultExplanation(outcome);
}

function toSimpleOutcome(value: string): 'HIT' | 'BLOCKED' | 'INFO' {
  const normalized = toString(value).toUpperCase();
  if (normalized === 'HIT') {
    return 'HIT';
  }
  if (normalized === 'BLOCKED' || normalized === 'NO_POLICY') {
    return 'BLOCKED';
  }
  return 'INFO';
}

export function buildExecutionConsistencyRecords(
  notifications: CustomerNotificationItem[],
  limit = 5,
): ExecutionConsistencyRecord[] {
  const rows = Array.isArray(notifications) ? notifications : [];
  const safeLimit = Math.max(1, Math.min(20, Math.floor(Number(limit) || 5)));
  return rows
    .filter((item) => toString(item.category).toUpperCase() === 'EXECUTION_RESULT')
    .slice(0, safeLimit)
    .map((item) => {
      const relatedOutcome = item.related?.outcome;
      const outcome = relatedOutcome
        ? normalizeOutcome(relatedOutcome)
        : inferOutcomeByTitleOrBody(`${toString(item.title)} ${toString(item.body)}`);
      const stage = toStageLabel(toString(item.related?.event));
      return {
        notificationId: toString(item.notificationId),
        title: toStringWithFallback(item.title, '权益触达结果'),
        stage,
        outcome,
        outcomeLabel: toOutcomeLabel(outcome),
        explanation: toExplanation(item, outcome),
        reasonCodes: toReasonCodes(item),
        createdAt: toString(item.createdAt),
      };
    });
}

export function hasTouchpointConsistencyConflict(
  touchpoints: TouchpointItem[] = [],
  records: ExecutionConsistencyRecord[] = [],
): boolean {
  if (!Array.isArray(touchpoints) || !Array.isArray(records) || records.length === 0) {
    return false;
  }
  const latestByStage = new Map<string, ExecutionConsistencyRecord>();
  for (const record of records) {
    const stage = toString(record.stage);
    if (!stage || stage === '触达' || latestByStage.has(stage)) {
      continue;
    }
    latestByStage.set(stage, record);
  }
  if (latestByStage.size === 0) {
    return false;
  }
  return touchpoints.some((row) => {
    const stage = toString(row.stage);
    const matched = latestByStage.get(stage);
    if (!matched) {
      return false;
    }
    const left = toSimpleOutcome(row.outcome);
    const right = toSimpleOutcome(matched.outcome);
    return left !== right;
  });
}
