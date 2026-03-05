import React, { useCallback, useEffect, useState } from 'react';
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
  getPolicyGovernanceReplays,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

const MODE_OPTIONS: GovernanceReplayMode[] = ['EXECUTE', 'EVALUATE'];
const OUTCOME_OPTIONS: GovernanceReplayOutcome[] = ['ALL', 'HIT', 'BLOCKED', 'NO_POLICY'];

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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<GovernanceReplayMode>('EXECUTE');
  const [outcomeFilter, setOutcomeFilter] = useState<GovernanceReplayOutcome>('ALL');
  const [items, setItems] = useState<GovernanceReplayItem[]>([]);

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

  useEffect(() => {
    void loadReplays();
  }, [loadReplays]);

  const hitCount = items.filter((item) => item.outcome === 'HIT').length;
  const blockedCount = items.filter((item) => item.outcome === 'BLOCKED').length;
  const noPolicyCount = items.filter((item) => item.outcome === 'NO_POLICY').length;

  return (
    <AppShell scroll>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>执行回放</Text>
        <Text style={styles.subtitle}>查看策略命中、拦截和未命中原因，支持按事件与结果回放追踪。</Text>
      </View>

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
});
