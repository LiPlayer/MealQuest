import {AuditLogItem} from './merchantApi';

export type AuditSeverity = 'info' | 'warn' | 'error';

export interface AuditLogRow {
  id: string;
  action: string;
  title: string;
  status: string;
  severity: AuditSeverity;
  summary: string;
  detail: string;
}

function statusToMeta(status: AuditLogItem['status']) {
  if (status === 'SUCCESS') {
    return {title: '成功', severity: 'info' as const};
  }
  if (status === 'BLOCKED') {
    return {title: '阻断', severity: 'warn' as const};
  }
  if (status === 'DENIED') {
    return {title: '拒绝', severity: 'warn' as const};
  }
  return {title: '失败', severity: 'error' as const};
}

function toTimeLabel(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }
  return date.toLocaleTimeString('zh-CN', {hour12: false});
}

function stringifyDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details || {});
  if (entries.length === 0) {
    return '无 details';
  }
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return 'details 解析失败';
  }
}

export function buildAuditLogRow(item: AuditLogItem): AuditLogRow {
  const meta = statusToMeta(item.status);
  const time = toTimeLabel(item.timestamp);
  return {
    id: item.auditId,
    action: item.action,
    title: meta.title,
    status: item.status,
    severity: meta.severity,
    summary: `[${time}] ${item.action} · ${meta.title}`,
    detail: stringifyDetails(item.details || {}),
  };
}
