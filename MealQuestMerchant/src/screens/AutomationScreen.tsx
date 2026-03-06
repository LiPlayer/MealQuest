import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import StatTile from '../components/ui/StatTile';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import {
  AutomationConfigResponse,
  AutomationEvent,
  AutomationExecutionItem,
  AutomationExecutionOutcome,
  AutomationRule,
  getPolicyAutomationConfig,
  getPolicyAutomationExecutions,
  setPolicyAutomationConfig,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

const EVENT_FILTERS: (AutomationEvent | 'ALL')[] = ['ALL', 'USER_ENTER_SHOP', 'PAYMENT_VERIFY'];
const OUTCOME_FILTERS: AutomationExecutionOutcome[] = ['ALL', 'HIT', 'BLOCKED', 'NO_POLICY'];

type AutomationDraft = {
  enabled: boolean;
  rules: AutomationRule[];
};

function toEventText(event: AutomationEvent | 'ALL'): string {
  if (event === 'USER_ENTER_SHOP') {
    return '顾客入店';
  }
  if (event === 'PAYMENT_VERIFY') {
    return '支付核销';
  }
  return '全部事件';
}

function toOutcomeText(outcome: AutomationExecutionOutcome | AutomationExecutionItem['outcome']): string {
  if (outcome === 'HIT') {
    return '命中';
  }
  if (outcome === 'BLOCKED') {
    return '阻断';
  }
  if (outcome === 'NO_POLICY') {
    return '未命中';
  }
  return '全部结果';
}

function toEnabledText(value: boolean): string {
  return value ? '开启' : '关闭';
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '暂无';
  }
  const ts = Date.parse(String(value));
  if (!Number.isFinite(ts)) {
    return String(value);
  }
  return new Date(ts).toLocaleString();
}

function toDraft(config: AutomationConfigResponse): AutomationDraft {
  const rules = Array.isArray(config.rules)
    ? config.rules.map((item) => ({
        ruleId: String(item.ruleId || '').trim(),
        event: item.event,
        enabled: Boolean(item.enabled),
        description: String(item.description || '').trim() || undefined,
      }))
    : [];
  return {
    enabled: Boolean(config.enabled),
    rules,
  };
}

export default function AutomationScreen() {
  const { authSession } = useMerchant();
  const role = String(authSession?.role || '').trim().toUpperCase();
  const canView = role === 'OWNER' || role === 'MANAGER';
  const canEdit = role === 'OWNER';
  const merchantId = String(authSession?.merchantId || '').trim();
  const token = String(authSession?.token || '').trim();

  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState('');
  const [configNotice, setConfigNotice] = useState('');
  const [config, setConfig] = useState<AutomationConfigResponse | null>(null);
  const [draft, setDraft] = useState<AutomationDraft | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  const [executionLoading, setExecutionLoading] = useState(true);
  const [executionError, setExecutionError] = useState('');
  const [executions, setExecutions] = useState<AutomationExecutionItem[]>([]);
  const [eventFilter, setEventFilter] = useState<AutomationEvent | 'ALL'>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<AutomationExecutionOutcome>('ALL');

  const loadConfig = useCallback(async () => {
    if (!merchantId || !token || !canView) {
      setConfigLoading(false);
      return;
    }
    setConfigLoading(true);
    setConfigError('');
    try {
      const result = await getPolicyAutomationConfig({
        merchantId,
        token,
      });
      setConfig(result);
      setDraft(toDraft(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : '自动化配置加载失败';
      setConfigError(message);
    } finally {
      setConfigLoading(false);
    }
  }, [canView, merchantId, token]);

  const loadExecutions = useCallback(async () => {
    if (!merchantId || !token || !canView) {
      setExecutionLoading(false);
      return;
    }
    setExecutionLoading(true);
    setExecutionError('');
    try {
      const result = await getPolicyAutomationExecutions({
        merchantId,
        token,
        event: eventFilter,
        outcome: outcomeFilter,
        limit: 30,
      });
      setExecutions(Array.isArray(result.items) ? result.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行日志加载失败';
      setExecutionError(message);
    } finally {
      setExecutionLoading(false);
    }
  }, [canView, eventFilter, merchantId, outcomeFilter, token]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadExecutions();
  }, [loadExecutions]);

  const toggleGlobalEnabled = useCallback(() => {
    setDraft((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev));
  }, []);

  const toggleRuleEnabled = useCallback((ruleId: string) => {
    const safeRuleId = String(ruleId || '').trim();
    if (!safeRuleId) {
      return;
    }
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        rules: prev.rules.map((item) =>
          item.ruleId === safeRuleId
            ? {
                ...item,
                enabled: !item.enabled,
              }
            : item,
        ),
      };
    });
  }, []);

  const handleSaveConfig = useCallback(async () => {
    if (!merchantId || !token || !canEdit || !draft) {
      return;
    }
    setConfigSaving(true);
    setConfigError('');
    setConfigNotice('');
    try {
      const result = await setPolicyAutomationConfig({
        merchantId,
        token,
        enabled: draft.enabled,
        rules: draft.rules,
      });
      setConfig(result);
      setDraft(toDraft(result));
      setConfigNotice('自动化配置已更新。');
      await loadExecutions();
    } catch (error) {
      const message = error instanceof Error ? error.message : '自动化配置保存失败';
      setConfigError(message);
    } finally {
      setConfigSaving(false);
    }
  }, [canEdit, draft, loadExecutions, merchantId, token]);

  const enabledRuleCount = useMemo(() => {
    const rules = Array.isArray(draft?.rules) ? draft?.rules : [];
    return rules.filter((item) => item.enabled).length;
  }, [draft?.rules]);

  const summary = useMemo(() => {
    return {
      total: executions.length,
      hit: executions.filter((item) => item.outcome === 'HIT').length,
      blocked: executions.filter((item) => item.outcome === 'BLOCKED').length,
      noPolicy: executions.filter((item) => item.outcome === 'NO_POLICY').length,
    };
  }, [executions]);

  return (
    <AppShell scroll>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>自动化运营</Text>
        <Text style={styles.subtitle}>配置触发规则并追踪执行结果，确保自动化可控、可审计、可解释。</Text>
      </View>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>自动化配置</Text>
        {!canView ? <Text style={styles.metaText}>当前角色无自动化查看权限（仅 OWNER/MANAGER 可访问）。</Text> : null}
        {canView ? (
          <>
            <View style={styles.grid}>
              <StatTile label="全局状态" value={toEnabledText(Boolean(draft?.enabled))} />
              <StatTile label="已启用规则" value={enabledRuleCount} />
              <StatTile label="规则总数" value={draft?.rules.length || 0} />
            </View>
            <Text style={styles.metaText}>最近更新：{formatTimestamp(config?.updatedAt)}</Text>
            <Text style={styles.metaText}>更新人：{config?.updatedBy || '暂无'}</Text>
            {!canEdit ? <Text style={styles.metaText}>当前角色仅可查看，配置修改需 OWNER 权限。</Text> : null}
            {configLoading ? <Text style={styles.metaText}>自动化配置加载中...</Text> : null}
            {configError ? <Text style={styles.errorText}>{configError}</Text> : null}
            {configNotice ? <Text style={styles.noticeText}>{configNotice}</Text> : null}

            {draft ? (
              <>
                <View style={styles.rowCard}>
                  <Text style={styles.rowTitle}>全局熔断</Text>
                  <Text style={styles.metaText}>状态：{toEnabledText(draft.enabled)}</Text>
                  <Text style={styles.metaText}>关闭后自动化执行将被跳过，但不影响登录/支付主链路。</Text>
                  {canEdit ? (
                    <ActionButton
                      label={draft.enabled ? '关闭自动化' : '开启自动化'}
                      icon={draft.enabled ? 'toggle-off' : 'toggle-on'}
                      variant="secondary"
                      onPress={toggleGlobalEnabled}
                      disabled={configSaving}
                    />
                  ) : null}
                </View>
                {draft.rules.map((rule) => (
                  <View key={rule.ruleId} style={styles.rowCard}>
                    <Text style={styles.rowTitle}>{toEventText(rule.event)}</Text>
                    <Text style={styles.metaText}>规则ID：{rule.ruleId}</Text>
                    <Text style={styles.metaText}>状态：{toEnabledText(rule.enabled)}</Text>
                    <Text style={styles.metaText}>{rule.description || '无补充说明'}</Text>
                    {canEdit ? (
                      <ActionButton
                        label={rule.enabled ? '停用规则' : '启用规则'}
                        icon={rule.enabled ? 'pause-circle' : 'play-circle'}
                        variant="secondary"
                        onPress={() => {
                          toggleRuleEnabled(rule.ruleId);
                        }}
                        disabled={configSaving}
                      />
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}

            <View style={styles.actionWrap}>
              <ActionButton
                label="刷新配置"
                icon="refresh"
                variant="secondary"
                onPress={() => {
                  void loadConfig();
                }}
                disabled={configLoading || configSaving}
              />
              {canEdit ? (
                <ActionButton
                  label={configSaving ? '保存中...' : '保存配置'}
                  icon={configSaving ? 'hourglass-top' : 'save'}
                  onPress={() => {
                    void handleSaveConfig();
                  }}
                  disabled={configLoading || configSaving || !draft}
                  busy={configSaving}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>执行摘要</Text>
        <View style={styles.grid}>
          <StatTile label="日志总数" value={summary.total} />
          <StatTile label="命中" value={summary.hit} />
          <StatTile label="阻断" value={summary.blocked} />
        </View>
        <View style={styles.grid}>
          <StatTile label="未命中" value={summary.noPolicy} />
          <StatTile label="事件筛选" value={toEventText(eventFilter)} />
          <StatTile label="结果筛选" value={toOutcomeText(outcomeFilter)} />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>日志筛选</Text>
        <Text style={styles.filterLabel}>事件</Text>
        <View style={styles.chipWrap}>
          {EVENT_FILTERS.map((item) => {
            const active = item === eventFilter;
            return (
              <Pressable
                key={item}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => setEventFilter(item)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{toEventText(item)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.filterLabel}>结果</Text>
        <View style={styles.chipWrap}>
          {OUTCOME_FILTERS.map((item) => {
            const active = item === outcomeFilter;
            return (
              <Pressable
                key={item}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => setOutcomeFilter(item)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{toOutcomeText(item)}</Text>
              </Pressable>
            );
          })}
        </View>
        <ActionButton
          label="刷新日志"
          icon="refresh"
          variant="secondary"
          onPress={() => {
            void loadExecutions();
          }}
          disabled={executionLoading}
        />
        {executionError ? <Text style={styles.errorText}>{executionError}</Text> : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>执行日志</Text>
        {executionLoading ? <Text style={styles.metaText}>执行日志加载中...</Text> : null}
        {!executionLoading && executions.length === 0 ? (
          <Text style={styles.metaText}>当前筛选条件下暂无自动化执行记录。</Text>
        ) : null}
        {!executionLoading
          ? executions.map((item) => (
              <View key={item.decisionId} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{toEventText(item.event)}</Text>
                <Text style={styles.metaText}>结果：{toOutcomeText(item.outcome)}</Text>
                <Text style={styles.metaText}>用户：{item.userId || '-'}</Text>
                <Text style={styles.metaText}>decisionId：{item.decisionId}</Text>
                <Text style={styles.metaText}>traceId：{item.traceId || '-'}</Text>
                <Text style={styles.metaText}>执行策略数：{item.executedCount}</Text>
                <Text style={styles.metaText}>
                  原因码：{item.reasonCodes.length > 0 ? item.reasonCodes.join(' / ') : '无'}
                </Text>
                <Text style={styles.metaText}>发生时间：{formatTimestamp(item.createdAt)}</Text>
              </View>
            ))
          : null}
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingTop: mqTheme.spacing.sm,
    gap: 4,
  },
  title: {
    ...mqTheme.typography.title,
    fontSize: 22,
  },
  subtitle: {
    ...mqTheme.typography.body,
    color: '#435571',
  },
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
  },
  grid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  actionWrap: {
    gap: mqTheme.spacing.sm,
  },
  rowCard: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    padding: mqTheme.spacing.sm,
    gap: 4,
    backgroundColor: '#ffffff',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1f314d',
  },
  filterLabel: {
    ...mqTheme.typography.caption,
    color: '#4e617d',
  },
  chipWrap: {
    flexDirection: 'row',
    gap: mqTheme.spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d0dbed',
    borderRadius: mqTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f4f7fc',
  },
  chipActive: {
    borderColor: '#9bb8ec',
    backgroundColor: '#e8f0ff',
  },
  chipText: {
    fontSize: 12,
    color: '#4e617d',
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#244f90',
  },
  metaText: {
    ...mqTheme.typography.caption,
    color: '#5b6f8f',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: mqTheme.colors.danger,
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1b6f3a',
  },
});
