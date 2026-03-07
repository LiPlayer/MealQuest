import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import StatTile from '../components/ui/StatTile';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import {
  GovernanceReplayItem,
  GovernanceReplayMode,
  GovernanceReplayOutcome,
  LifecycleStrategyItem,
  LifecycleStrategyStage,
  enableLifecycleStrategy,
  getLifecycleStrategyLibrary,
  getPolicyGovernanceReplays,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

const MODE_OPTIONS: GovernanceReplayMode[] = ['EXECUTE', 'EVALUATE'];
const OUTCOME_OPTIONS: GovernanceReplayOutcome[] = ['ALL', 'HIT', 'BLOCKED', 'NO_POLICY'];
const LIFECYCLE_STAGE_ORDER: LifecycleStrategyStage[] = [
  'ACQUISITION',
  'ACTIVATION',
  'ENGAGEMENT',
  'EXPANSION',
  'RETENTION',
];

function toStageText(value: LifecycleStrategyStage): string {
  if (value === 'ACQUISITION') {
    return '获客';
  }
  if (value === 'ACTIVATION') {
    return '激活';
  }
  if (value === 'ENGAGEMENT') {
    return '活跃';
  }
  if (value === 'EXPANSION') {
    return '扩收';
  }
  return '留存';
}

function toStrategyStatusText(value: string): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'ACTIVE') {
    return '已启用';
  }
  if (normalized === 'PENDING_APPROVAL') {
    return '待审批';
  }
  if (normalized === 'PAUSED') {
    return '已暂停';
  }
  return '草稿';
}

function formatTimestamp(value: string): string {
  const ts = Date.parse(String(value || ''));
  if (!Number.isFinite(ts)) {
    return value || '暂无';
  }
  return new Date(ts).toLocaleString();
}

function toOutcomeText(value: GovernanceReplayOutcome | GovernanceReplayItem['outcome']): string {
  if (value === 'HIT') {
    return '命中';
  }
  if (value === 'BLOCKED') {
    return '拦截';
  }
  if (value === 'NO_POLICY') {
    return '无策略';
  }
  return '全部';
}

export default function ReplayScreen() {
  const { authSession } = useMerchant();
  const canOperate = useMemo(
    () => String(authSession?.role || '').toUpperCase() === 'OWNER',
    [authSession?.role],
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<GovernanceReplayMode>('EXECUTE');
  const [outcomeFilter, setOutcomeFilter] = useState<GovernanceReplayOutcome>('ALL');
  const [items, setItems] = useState<GovernanceReplayItem[]>([]);
  const [lifecycleLoading, setLifecycleLoading] = useState(true);
  const [lifecycleError, setLifecycleError] = useState('');
  const [lifecycleNotice, setLifecycleNotice] = useState('');
  const [catalogVersion, setCatalogVersion] = useState('');
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState('');
  const [lifecycleItems, setLifecycleItems] = useState<LifecycleStrategyItem[]>([]);
  const [actingTemplateId, setActingTemplateId] = useState('');

  const loadReplays = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await getPolicyGovernanceReplays({
        merchantId: authSession.merchantId,
        token: authSession.token,
        event: eventFilter,
        mode: modeFilter,
        outcome: outcomeFilter,
        limit: 50,
      });
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : '回放列表加载失败';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [authSession, eventFilter, modeFilter, outcomeFilter]);

  const loadLifecycleLibrary = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setLifecycleLoading(false);
      return;
    }
    setLifecycleLoading(true);
    setLifecycleError('');
    try {
      const result = await getLifecycleStrategyLibrary({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      const rows = Array.isArray(result.items) ? result.items : [];
      rows.sort((left, right) => {
        const leftIndex = LIFECYCLE_STAGE_ORDER.indexOf(left.stage);
        const rightIndex = LIFECYCLE_STAGE_ORDER.indexOf(right.stage);
        return leftIndex - rightIndex;
      });
      setCatalogVersion(String(result.catalogVersion || ''));
      setCatalogUpdatedAt(String(result.catalogUpdatedAt || ''));
      setLifecycleItems(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : '生命周期策略加载失败';
      setLifecycleError(message);
    } finally {
      setLifecycleLoading(false);
    }
  }, [authSession]);

  useEffect(() => {
    void loadReplays();
  }, [loadReplays]);

  useEffect(() => {
    void loadLifecycleLibrary();
  }, [loadLifecycleLibrary]);

  const handleEnableLifecycle = useCallback(
    async (templateId: string) => {
      if (!authSession || !authSession.token || !authSession.merchantId) {
        return;
      }
      if (!canOperate) {
        return;
      }
      setLifecycleError('');
      setLifecycleNotice('');
      setActingTemplateId(templateId);
      try {
        const result = await enableLifecycleStrategy({
          merchantId: authSession.merchantId,
          templateId,
          token: authSession.token,
        });
        setLifecycleNotice(
          result.alreadyEnabled
            ? `${toStageText(result.stage)}阶段已处于启用状态。`
            : `${toStageText(result.stage)}阶段启用成功。`,
        );
        await loadLifecycleLibrary();
      } catch (error) {
        const message = error instanceof Error ? error.message : '生命周期策略启用失败';
        setLifecycleError(message);
      } finally {
        setActingTemplateId('');
      }
    },
    [authSession, canOperate, loadLifecycleLibrary],
  );

  const hitCount = items.filter((item) => item.outcome === 'HIT').length;
  const blockedCount = items.filter((item) => item.outcome === 'BLOCKED').length;
  const noPolicyCount = items.filter((item) => item.outcome === 'NO_POLICY').length;
  const lifecycleActiveCount = lifecycleItems.filter(
    (item) => String(item.status || '').trim().toUpperCase() === 'ACTIVE',
  ).length;
  const lifecycleDraftCount = lifecycleItems.length - lifecycleActiveCount;

  return (
    <AppShell scroll edges={['bottom']}>
      <SurfaceCard>
        <Text style={styles.sectionTitle}>生命周期策略运营</Text>
        <View style={styles.grid}>
          <StatTile label="阶段总数" value={lifecycleItems.length} />
          <StatTile label="已启用" value={lifecycleActiveCount} />
          <StatTile label="待启用" value={lifecycleDraftCount} />
        </View>
        <Text style={styles.metaText}>策略库版本：{catalogVersion || '-'}</Text>
        <Text style={styles.metaText}>模板更新时间：{catalogUpdatedAt ? formatTimestamp(catalogUpdatedAt) : '暂无'}</Text>
        {!canOperate ? (
          <Text style={styles.metaText}>当前角色仅可查看，阶段启用需 OWNER 权限。</Text>
        ) : null}
        <ActionButton
          label="刷新策略库"
          icon="refresh"
          variant="secondary"
          onPress={() => {
            void loadLifecycleLibrary();
          }}
          disabled={lifecycleLoading || Boolean(actingTemplateId)}
        />
        {lifecycleError ? <Text style={styles.errorText}>{lifecycleError}</Text> : null}
        {lifecycleNotice ? <Text style={styles.noticeText}>{lifecycleNotice}</Text> : null}
        {lifecycleLoading ? <Text style={styles.metaText}>生命周期策略加载中...</Text> : null}
        {lifecycleItems.map((item) => {
          const busy = actingTemplateId === item.templateId;
          const statusText = toStrategyStatusText(item.status);
          return (
            <View key={item.templateId} style={styles.rowCard}>
              <Text style={styles.rowTitle}>{toStageText(item.stage)} · {item.templateName || item.templateId}</Text>
              <Text style={styles.metaText}>状态：{statusText}</Text>
              <Text style={styles.metaText}>触发事件：{item.triggerEvent || '-'}</Text>
              <Text style={styles.metaText}>策略键：{item.policyKey || '-'}</Text>
              <Text style={styles.metaText}>最近策略：{item.lastPolicyId || '暂无'}</Text>
              <Text style={styles.metaText}>
                更新时间：{item.updatedAt ? formatTimestamp(item.updatedAt) : '暂无'}
              </Text>
              {canOperate ? (
                <ActionButton
                  label={busy ? '启用中...' : '启用阶段'}
                  icon={busy ? 'hourglass-top' : 'play-circle'}
                  onPress={() => {
                    void handleEnableLifecycle(item.templateId);
                  }}
                  disabled={busy || Boolean(actingTemplateId && !busy) || lifecycleLoading}
                  busy={busy}
                />
              ) : null}
            </View>
          );
        })}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>回放摘要</Text>
        <View style={styles.grid}>
          <StatTile label="回放总数" value={items.length} />
          <StatTile label="命中" value={hitCount} />
          <StatTile label="拦截" value={blockedCount} />
        </View>
        <View style={styles.grid}>
          <StatTile label="无策略" value={noPolicyCount} />
          <StatTile label="模式" value={modeFilter} />
          <StatTile label="筛选结果" value={toOutcomeText(outcomeFilter)} />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>过滤条件</Text>
        <Text style={styles.metaText}>模式</Text>
        <View style={styles.chipRow}>
          {MODE_OPTIONS.map((item) => {
            const active = item === modeFilter;
            return (
              <Pressable
                key={item}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => setModeFilter(item)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.metaText}>结果</Text>
        <View style={styles.chipRow}>
          {OUTCOME_OPTIONS.map((item) => {
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

        <Text style={styles.metaText}>事件（可选）</Text>
        <TextInput
          value={eventFilter}
          onChangeText={setEventFilter}
          placeholder="例如 PAYMENT_VERIFY / USER_ENTER_SHOP"
          placeholderTextColor="#8093ab"
          style={styles.input}
          autoCapitalize="characters"
        />

        <ActionButton
          label="刷新回放"
          icon="refresh"
          variant="secondary"
          onPress={() => {
            void loadReplays();
          }}
          disabled={loading}
        />
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>回放列表</Text>
        {loading ? <Text style={styles.metaText}>加载中...</Text> : null}
        {!loading && items.length === 0 ? <Text style={styles.metaText}>当前筛选下暂无回放记录。</Text> : null}
        {!loading
          ? items.map((item) => (
              <View key={item.decisionId} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{item.event || 'UNKNOWN_EVENT'}</Text>
                <Text style={styles.metaText}>结果：{toOutcomeText(item.outcome)}</Text>
                <Text style={styles.metaText}>模式：{item.mode}</Text>
                <Text style={styles.metaText}>用户：{item.userId || '-'}</Text>
                <Text style={styles.metaText}>decisionId：{item.decisionId}</Text>
                <Text style={styles.metaText}>traceId：{item.traceId || '-'}</Text>
                <Text style={styles.metaText}>执行策略数：{item.executed.length}</Text>
                <Text style={styles.metaText}>拦截策略数：{item.rejected.length}</Text>
                <Text style={styles.metaText}>
                  拦截原因：{item.reasonCodes.length > 0 ? item.reasonCodes.join(' / ') : '无'}
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
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
  },
  grid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  chipRow: {
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
  input: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: mqTheme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    color: mqTheme.colors.ink,
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
