import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import StatTile from '../components/ui/StatTile';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import {
  GovernanceApprovalItem,
  GovernanceApprovalsStatus,
  GovernanceOverviewResponse,
  approvePolicyDraft,
  getPolicyGovernanceApprovals,
  getPolicyGovernanceOverview,
  publishPolicyDraft,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

const STATUS_FILTERS: GovernanceApprovalsStatus[] = ['ALL', 'SUBMITTED', 'APPROVED', 'PUBLISHED'];

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '暂无';
  }
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) {
    return value;
  }
  return new Date(ts).toLocaleString();
}

function statusText(status: GovernanceApprovalsStatus): string {
  if (status === 'SUBMITTED') {
    return '待审批';
  }
  if (status === 'APPROVED') {
    return '待发布';
  }
  if (status === 'PUBLISHED') {
    return '已发布';
  }
  return '全部';
}

export default function ApprovalsScreen() {
  const { authSession } = useMerchant();
  const [statusFilter, setStatusFilter] = useState<GovernanceApprovalsStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [actingDraftId, setActingDraftId] = useState('');
  const [overview, setOverview] = useState<GovernanceOverviewResponse | null>(null);
  const [items, setItems] = useState<GovernanceApprovalItem[]>([]);

  const canOperate = useMemo(
    () => String(authSession?.role || '').toUpperCase() === 'OWNER',
    [authSession?.role],
  );

  const loadApprovals = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const [overviewResult, approvalsResult] = await Promise.all([
        getPolicyGovernanceOverview({
          merchantId: authSession.merchantId,
          token: authSession.token,
        }),
        getPolicyGovernanceApprovals({
          merchantId: authSession.merchantId,
          token: authSession.token,
          status: statusFilter,
          limit: 30,
        }),
      ]);
      setOverview(overviewResult);
      setItems(Array.isArray(approvalsResult.items) ? approvalsResult.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : '审批队列加载失败';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [authSession, statusFilter]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const handleApprove = useCallback(
    async (draftId: string) => {
      if (!authSession || !authSession.token || !authSession.merchantId) {
        return;
      }
      setActingDraftId(draftId);
      setErrorMessage('');
      setNoticeMessage('');
      try {
        await approvePolicyDraft({
          merchantId: authSession.merchantId,
          draftId,
          token: authSession.token,
        });
        setNoticeMessage('审批成功，已进入待发布。');
        await loadApprovals();
      } catch (error) {
        const message = error instanceof Error ? error.message : '审批失败';
        setErrorMessage(message);
      } finally {
        setActingDraftId('');
      }
    },
    [authSession, loadApprovals],
  );

  const handlePublish = useCallback(
    async (item: GovernanceApprovalItem) => {
      if (!authSession || !authSession.token || !authSession.merchantId) {
        return;
      }
      setActingDraftId(item.draftId);
      setErrorMessage('');
      setNoticeMessage('');
      try {
        await publishPolicyDraft({
          merchantId: authSession.merchantId,
          draftId: item.draftId,
          approvalId: item.approvalId,
          token: authSession.token,
        });
        setNoticeMessage('策略发布成功，已进入执行态。');
        await loadApprovals();
      } catch (error) {
        const message = error instanceof Error ? error.message : '发布失败';
        setErrorMessage(message);
      } finally {
        setActingDraftId('');
      }
    },
    [authSession, loadApprovals],
  );

  return (
    <AppShell scroll>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>审批中心</Text>
        <Text style={styles.subtitle}>覆盖待审批、待发布、已发布全链路，确保策略执行前有人审、可追溯。</Text>
      </View>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>治理概览</Text>
        <View style={styles.grid}>
          <StatTile label="待审批" value={overview?.pendingApprovalCount ?? 0} />
          <StatTile label="待发布" value={overview?.approvedAwaitPublishCount ?? 0} />
          <StatTile label="活跃策略" value={overview?.activePolicyCount ?? 0} />
        </View>
        <View style={styles.grid}>
          <StatTile label="暂停策略" value={overview?.pausedPolicyCount ?? 0} />
          <StatTile label="24h 命中" value={overview?.decision24h.hit ?? 0} />
          <StatTile label="24h 拦截" value={overview?.decision24h.blocked ?? 0} />
        </View>
        <Text style={styles.metaText}>最近更新：{formatTimestamp(overview?.lastUpdatedAt || null)}</Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>审批队列</Text>
        <View style={styles.filterWrap}>
          {STATUS_FILTERS.map((item) => {
            const active = item === statusFilter;
            return (
              <Pressable
                key={item}
                style={[styles.filterChip, active ? styles.filterChipActive : null]}
                onPress={() => {
                  setStatusFilter(item);
                }}
              >
                <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{statusText(item)}</Text>
              </Pressable>
            );
          })}
          <ActionButton
            label="刷新"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              void loadApprovals();
            }}
            disabled={loading}
          />
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {noticeMessage ? <Text style={styles.noticeText}>{noticeMessage}</Text> : null}
        {!canOperate ? <Text style={styles.metaText}>当前角色仅可查看，审批与发布需要 OWNER 权限。</Text> : null}
        {loading ? <Text style={styles.metaText}>加载中...</Text> : null}

        {!loading && items.length === 0 ? (
          <Text style={styles.metaText}>当前筛选条件下暂无审批项。</Text>
        ) : null}

        {!loading
          ? items.map((item) => {
              const canApprove = canOperate && item.status === 'SUBMITTED';
              const canPublish = canOperate && item.status === 'APPROVED';
              const acting = actingDraftId === item.draftId;
              return (
                <View key={item.draftId} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>{item.policyName || item.policyKey || item.draftId}</Text>
                  <Text style={styles.metaText}>状态：{statusText(item.status)}</Text>
                  <Text style={styles.metaText}>策略键：{item.policyKey || '-'}</Text>
                  <Text style={styles.metaText}>提交时间：{formatTimestamp(item.submittedAt)}</Text>
                  <Text style={styles.metaText}>审批时间：{formatTimestamp(item.approvedAt)}</Text>
                  <Text style={styles.metaText}>发布时间：{formatTimestamp(item.publishedAt)}</Text>
                  <View style={styles.actionWrap}>
                    {canApprove ? (
                      <ActionButton
                        label={acting ? '审批中...' : '同意审批'}
                        icon={acting ? 'hourglass-top' : 'task-alt'}
                        onPress={() => {
                          void handleApprove(item.draftId);
                        }}
                        disabled={acting}
                        busy={acting}
                      />
                    ) : null}
                    {canPublish ? (
                      <ActionButton
                        label={acting ? '发布中...' : '发布策略'}
                        icon={acting ? 'hourglass-top' : 'publish'}
                        onPress={() => {
                          void handlePublish(item);
                        }}
                        disabled={acting}
                        busy={acting}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })
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
  filterWrap: {
    gap: mqTheme.spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#d0dbed',
    borderRadius: mqTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f4f7fc',
    alignSelf: 'flex-start',
  },
  filterChipActive: {
    borderColor: '#9bb8ec',
    backgroundColor: '#e8f0ff',
  },
  filterText: {
    fontSize: 12,
    color: '#4e617d',
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#244f90',
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
  actionWrap: {
    marginTop: 6,
    gap: mqTheme.spacing.xs,
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
    color: '#20624b',
  },
});
