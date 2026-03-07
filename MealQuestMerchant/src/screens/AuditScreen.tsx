import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import StatTile from '../components/ui/StatTile';
import { useMerchant } from '../context/MerchantContext';
import useNotificationDots from '../hooks/useNotificationDots';
import {
  GovernanceReplayItem,
  GovernanceReplayMode,
  GovernanceReplayOutcome,
  PaymentLedgerRow,
  getPaymentLedger,
  getPolicyGovernanceReplays,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

const MODE_OPTIONS: GovernanceReplayMode[] = ['EXECUTE', 'EVALUATE'];
const OUTCOME_OPTIONS: GovernanceReplayOutcome[] = ['ALL', 'HIT', 'BLOCKED', 'NO_POLICY'];

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

function formatTimestamp(value: string): string {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) {
    return value || '暂无';
  }
  return new Date(parsed).toLocaleString();
}

function formatMoney(value: number): string {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return '-';
  }
  return `¥${safe.toFixed(2)}`;
}

function rowKey(row: PaymentLedgerRow): string {
  return `${row.txnId}_${row.createdAt}`;
}

export default function AuditScreen() {
  const { authSession } = useMerchant();
  const { dots } = useNotificationDots(authSession);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<GovernanceReplayMode>('EXECUTE');
  const [outcomeFilter, setOutcomeFilter] = useState<GovernanceReplayOutcome>('ALL');
  const [replays, setReplays] = useState<GovernanceReplayItem[]>([]);
  const [ledgerRows, setLedgerRows] = useState<PaymentLedgerRow[]>([]);

  const loadData = useCallback(async () => {
    const merchantId = String(authSession?.merchantId || '').trim();
    const token = String(authSession?.token || '').trim();
    if (!merchantId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const [replayResult, ledgerResult] = await Promise.all([
        getPolicyGovernanceReplays({
          merchantId,
          token,
          event: eventFilter,
          mode: modeFilter,
          outcome: outcomeFilter,
          limit: 50,
        }),
        getPaymentLedger({
          merchantId,
          token,
          limit: 50,
        }),
      ]);
      setReplays(Array.isArray(replayResult.items) ? replayResult.items : []);
      setLedgerRows(Array.isArray(ledgerResult.items) ? ledgerResult.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : '审计数据加载失败';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [authSession?.merchantId, authSession?.token, eventFilter, modeFilter, outcomeFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const replayHitCount = useMemo(
    () => replays.filter((item) => String(item.outcome || '').toUpperCase() === 'HIT').length,
    [replays],
  );
  const replayBlockedCount = useMemo(
    () => replays.filter((item) => String(item.outcome || '').toUpperCase() === 'BLOCKED').length,
    [replays],
  );

  return (
    <AppShell scroll>
      <SurfaceCard>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>审计中心</Text>
          {dots.auditUnread > 0 ? <View style={styles.dot} /> : null}
        </View>
        <Text style={styles.metaText}>统一查看交易流水和营销执行历史。</Text>
        <View style={styles.grid}>
          <StatTile label="流水记录" value={ledgerRows.length} />
          <StatTile label="执行记录" value={replays.length} />
          <StatTile label="执行未读" value={dots.auditUnread} />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>交易流水</Text>
          <ActionButton
            label="刷新"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              void loadData();
            }}
            disabled={loading}
          />
        </View>
        {loading ? <Text style={styles.metaText}>流水加载中...</Text> : null}
        {!loading && ledgerRows.length === 0 ? <Text style={styles.metaText}>暂无交易流水。</Text> : null}
        {!loading
          ? ledgerRows.map((row) => (
              <View key={rowKey(row)} style={styles.listCard}>
                <Text style={styles.itemTitle}>{row.type || '交易'} · {row.status || '-'}</Text>
                <Text style={styles.metaText}>金额：{formatMoney(Number(row.amount || 0))}</Text>
                <Text style={styles.metaText}>交易号：{row.paymentTxnId || row.txnId || '-'}</Text>
                <Text style={styles.metaText}>顾客：{row.userId || '-'}</Text>
                <Text style={styles.metaText}>时间：{formatTimestamp(row.createdAt || row.timestamp)}</Text>
              </View>
            ))
          : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>营销执行历史</Text>
        <Text style={styles.metaText}>按模式、结果、事件过滤执行回放。</Text>

        <Text style={styles.label}>模式</Text>
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

        <Text style={styles.label}>结果</Text>
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

        <Text style={styles.label}>事件（可选）</Text>
        <TextInput
          value={eventFilter}
          onChangeText={setEventFilter}
          placeholder="例如 PAYMENT_VERIFY / USER_ENTER_SHOP"
          placeholderTextColor="#8093ab"
          style={styles.input}
          autoCapitalize="characters"
        />

        <View style={styles.grid}>
          <StatTile label="命中" value={replayHitCount} />
          <StatTile label="拦截" value={replayBlockedCount} />
          <StatTile label="筛选" value={toOutcomeText(outcomeFilter)} />
        </View>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <ActionButton
          label="刷新执行历史"
          icon="refresh"
          variant="secondary"
          onPress={() => {
            void loadData();
          }}
          disabled={loading}
        />

        {loading ? <Text style={styles.metaText}>执行历史加载中...</Text> : null}
        {!loading && replays.length === 0 ? <Text style={styles.metaText}>当前筛选下暂无执行记录。</Text> : null}
        {!loading
          ? replays.map((item) => (
              <View key={item.decisionId || `${item.createdAt}_${item.traceId}`} style={styles.listCard}>
                <Text style={styles.itemTitle}>策略执行 · {item.decisionId || '-'}</Text>
                <Text style={styles.metaText}>结果：{toOutcomeText(item.outcome)}</Text>
                <Text style={styles.metaText}>事件：{item.event || '-'}</Text>
                <Text style={styles.metaText}>
                  原因：{Array.isArray(item.reasonCodes) && item.reasonCodes.length > 0 ? item.reasonCodes.join(' / ') : '-'}
                </Text>
                <Text style={styles.metaText}>时间：{formatTimestamp(item.createdAt)}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    ...mqTheme.typography.caption,
    color: '#405674',
  },
  grid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  label: {
    ...mqTheme.typography.caption,
    color: '#314765',
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: mqTheme.radius.pill,
    borderWidth: 1,
    borderColor: '#c7d8f3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f4f8ff',
  },
  chipActive: {
    borderColor: mqTheme.colors.primary,
    backgroundColor: '#e6efff',
  },
  chipText: {
    fontSize: 12,
    color: '#41597a',
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#123d75',
  },
  input: {
    borderRadius: mqTheme.radius.md,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: mqTheme.colors.ink,
    fontSize: 14,
  },
  listCard: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: mqTheme.colors.ink,
  },
  errorText: {
    ...mqTheme.typography.caption,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4d4f',
  },
});
