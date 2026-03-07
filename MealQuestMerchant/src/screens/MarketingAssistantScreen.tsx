import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import StatTile from '../components/ui/StatTile';
import { useMerchant } from '../context/MerchantContext';
import useNotificationDots from '../hooks/useNotificationDots';
import {
  AgentProposalReviewItem,
  AgentProposalStatus,
  LifecycleStrategyItem,
  LifecycleStrategyStage,
  PolicyRecord,
  RevenueStrategyConfig,
  decideAgentProposal,
  enableLifecycleStrategy,
  generateAgentProposal,
  getAgentProposalReviews,
  getLifecycleStrategyLibrary,
  getPolicies,
  getRevenueStrategyConfig,
  pausePolicy,
  recommendRevenueStrategyConfig,
  resumePolicy,
  setRevenueStrategyConfig,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

const STAGE_ORDER: LifecycleStrategyStage[] = [
  'ACQUISITION',
  'ACTIVATION',
  'ENGAGEMENT',
  'EXPANSION',
  'RETENTION',
];

const PROPOSAL_STATUS_FILTERS: AgentProposalStatus[] = ['ALL', 'PENDING', 'APPROVED', 'PUBLISHED', 'REJECTED'];

function toStageText(stage: LifecycleStrategyStage): string {
  if (stage === 'ACQUISITION') {
    return '获客';
  }
  if (stage === 'ACTIVATION') {
    return '激活';
  }
  if (stage === 'ENGAGEMENT') {
    return '活跃';
  }
  if (stage === 'EXPANSION') {
    return '扩收';
  }
  return '留存';
}

function proposalStatusLabel(status: AgentProposalStatus | string): string {
  const safeStatus = String(status || '').trim().toUpperCase();
  if (safeStatus === 'PENDING') {
    return '待启用';
  }
  if (safeStatus === 'APPROVED') {
    return '待发布';
  }
  if (safeStatus === 'PUBLISHED') {
    return '已启用';
  }
  if (safeStatus === 'REJECTED') {
    return '已删除';
  }
  return '全部';
}

function strategyStatusLabel(status: string): string {
  const safeStatus = String(status || '').trim().toUpperCase();
  if (safeStatus === 'ACTIVE') {
    return '已启用';
  }
  if (safeStatus === 'PAUSED') {
    return '已停用';
  }
  if (safeStatus === 'PENDING_APPROVAL') {
    return '待启用';
  }
  return '草稿';
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '暂无';
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

function toPositiveInt(value: number, fallback = 0): number {
  const safe = Math.floor(Number(value));
  if (!Number.isFinite(safe)) {
    return fallback;
  }
  return Math.max(0, safe);
}

function normalizeRevenueConfig(value: RevenueStrategyConfig | null): RevenueStrategyConfig | null {
  if (!value) {
    return null;
  }
  return {
    minOrderAmount: Number(value.minOrderAmount) || 0,
    voucherValue: Number(value.voucherValue) || 0,
    voucherCost: Number(value.voucherCost) || 0,
    budgetCap: Number(value.budgetCap) || 0,
    frequencyWindowSec: Number(value.frequencyWindowSec) || 0,
    frequencyMaxHits: Number(value.frequencyMaxHits) || 0,
    inventorySku: String(value.inventorySku || ''),
    inventoryMaxUnits: Number(value.inventoryMaxUnits) || 0,
  };
}

export default function MarketingAssistantScreen() {
  const {
    authSession,
    merchantState,
    aiIntentDraft,
    setAiIntentDraft,
    aiIntentSubmitting,
    chatSendError,
    onSendAgentMessage,
    onTriggerProactiveScan,
    agentMessages,
  } = useMerchant();
  const { dots } = useNotificationDots(authSession);

  const merchantId = String(authSession?.merchantId || '').trim();
  const token = String(authSession?.token || '').trim();
  const role = String(authSession?.role || '').trim().toUpperCase();
  const isOwner = role === 'OWNER';

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');

  const [lifecycleItems, setLifecycleItems] = useState<LifecycleStrategyItem[]>([]);
  const [actingTemplateId, setActingTemplateId] = useState('');
  const [policyMap, setPolicyMap] = useState<Record<string, PolicyRecord>>({});

  const [revenueConfig, setRevenueConfig] = useState<RevenueStrategyConfig | null>(null);
  const [applyingBudgetProfile, setApplyingBudgetProfile] = useState('');
  const [aiConfiguring, setAiConfiguring] = useState(false);

  const [proposalStatusFilter, setProposalStatusFilter] = useState<AgentProposalStatus>('ALL');
  const [proposalItems, setProposalItems] = useState<AgentProposalReviewItem[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState('');
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalGenerating, setProposalGenerating] = useState(false);
  const [proposalActionKey, setProposalActionKey] = useState('');

  const latestUserIntent = useMemo(() => {
    for (let index = agentMessages.length - 1; index >= 0; index -= 1) {
      const row = agentMessages[index];
      if (row && row.role === 'USER' && String(row.text || '').trim()) {
        return String(row.text || '').trim();
      }
    }
    return '';
  }, [agentMessages]);

  const activeLifecycleCount = useMemo(
    () => lifecycleItems.filter((item) => String(item.status || '').trim().toUpperCase() === 'ACTIVE').length,
    [lifecycleItems],
  );

  const loadLifecycleLibrary = useCallback(async () => {
    if (!merchantId || !token) {
      return;
    }
    const result = await getLifecycleStrategyLibrary({
      merchantId,
      token,
    });
    const rows = Array.isArray(result.items) ? result.items : [];
    rows.sort((left, right) => STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage));
    setLifecycleItems(rows);
  }, [merchantId, token]);

  const loadPolicies = useCallback(async () => {
    if (!merchantId || !token) {
      return;
    }
    const result = await getPolicies({
      merchantId,
      token,
      includeInactive: true,
    });
    const map: Record<string, PolicyRecord> = {};
    (Array.isArray(result.items) ? result.items : []).forEach((item) => {
      const policyId = String(item.policy_id || '').trim();
      if (!policyId) {
        return;
      }
      map[policyId] = item;
    });
    setPolicyMap(map);
  }, [merchantId, token]);

  const loadRevenueConfig = useCallback(async () => {
    if (!merchantId || !token) {
      return;
    }
    const result = await getRevenueStrategyConfig({
      merchantId,
      token,
    });
    setRevenueConfig(normalizeRevenueConfig(result.config));
  }, [merchantId, token]);

  const loadProposalList = useCallback(async () => {
    if (!merchantId || !token) {
      setProposalItems([]);
      setSelectedProposalId('');
      return;
    }
    setProposalLoading(true);
    try {
      const result = await getAgentProposalReviews({
        merchantId,
        token,
        status: proposalStatusFilter,
        limit: 30,
      });
      const rows = Array.isArray(result.items) ? result.items : [];
      setProposalItems(rows);
      const fallbackId = rows[0]?.proposalId || '';
      setSelectedProposalId((prev) => (rows.some((item) => item.proposalId === prev) ? prev : fallbackId));
    } finally {
      setProposalLoading(false);
    }
  }, [merchantId, proposalStatusFilter, token]);

  const loadAll = useCallback(async () => {
    if (!merchantId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      await Promise.all([
        loadLifecycleLibrary(),
        loadPolicies(),
        loadRevenueConfig(),
        loadProposalList(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '营销助手数据加载失败';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [loadLifecycleLibrary, loadPolicies, loadProposalList, loadRevenueConfig, merchantId, token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void loadProposalList();
  }, [loadProposalList]);

  const handleToggleLifecycle = useCallback(async (item: LifecycleStrategyItem) => {
    if (!merchantId || !token || !isOwner) {
      return;
    }
    setActingTemplateId(item.templateId);
    setErrorMessage('');
    setNoticeMessage('');
    try {
      const safeStatus = String(item.status || '').trim().toUpperCase();
      if (safeStatus === 'ACTIVE' && item.lastPolicyId) {
        await pausePolicy({
          merchantId,
          token,
          policyId: item.lastPolicyId,
          reason: 'merchant_manual_toggle_off',
        });
        setNoticeMessage(`${toStageText(item.stage)}阶段已停用。`);
      } else if (safeStatus === 'PAUSED' && item.lastPolicyId) {
        await resumePolicy({
          merchantId,
          token,
          policyId: item.lastPolicyId,
        });
        setNoticeMessage(`${toStageText(item.stage)}阶段已启用。`);
      } else {
        await enableLifecycleStrategy({
          merchantId,
          token,
          templateId: item.templateId,
        });
        setNoticeMessage(`${toStageText(item.stage)}阶段已启用。`);
      }
      await Promise.all([loadLifecycleLibrary(), loadPolicies()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '阶段开关更新失败';
      setErrorMessage(message);
    } finally {
      setActingTemplateId('');
    }
  }, [isOwner, loadLifecycleLibrary, loadPolicies, merchantId, token]);

  const applyBudgetProfile = useCallback(async (profile: 'SAFE' | 'BALANCED' | 'GROWTH') => {
    if (!merchantId || !token || !revenueConfig || !isOwner) {
      return;
    }
    setApplyingBudgetProfile(profile);
    setErrorMessage('');
    setNoticeMessage('');
    try {
      const base = revenueConfig;
      const next: RevenueStrategyConfig =
        profile === 'SAFE'
          ? {
              ...base,
              voucherValue: Math.max(1, Math.floor(base.voucherValue * 0.8)),
              budgetCap: Math.max(60, Math.floor(base.budgetCap * 0.7)),
              frequencyMaxHits: Math.max(1, Math.floor(base.frequencyMaxHits * 0.8)),
            }
          : profile === 'BALANCED'
            ? {
                ...base,
                voucherValue: Math.max(1, Math.floor(base.voucherValue)),
                budgetCap: Math.max(80, Math.floor(base.budgetCap)),
                frequencyMaxHits: Math.max(1, Math.floor(base.frequencyMaxHits)),
              }
            : {
                ...base,
                voucherValue: Math.max(1, Math.floor(base.voucherValue * 1.2)),
                budgetCap: Math.max(120, Math.floor(base.budgetCap * 1.3)),
                frequencyMaxHits: Math.max(1, Math.floor(base.frequencyMaxHits * 1.2)),
              };
      await setRevenueStrategyConfig({
        merchantId,
        token,
        config: {
          ...next,
          minOrderAmount: toPositiveInt(next.minOrderAmount),
          voucherValue: toPositiveInt(next.voucherValue),
          voucherCost: toPositiveInt(next.voucherCost),
          budgetCap: toPositiveInt(next.budgetCap),
          frequencyWindowSec: toPositiveInt(next.frequencyWindowSec),
          frequencyMaxHits: toPositiveInt(next.frequencyMaxHits, 1),
          inventorySku: String(next.inventorySku || ''),
          inventoryMaxUnits: toPositiveInt(next.inventoryMaxUnits),
        },
      });
      setNoticeMessage(
        profile === 'SAFE' ? '已切换到稳健档位。' : profile === 'BALANCED' ? '已切换到均衡档位。' : '已切换到增长档位。',
      );
      await loadRevenueConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : '预算档位应用失败';
      setErrorMessage(message);
    } finally {
      setApplyingBudgetProfile('');
    }
  }, [isOwner, loadRevenueConfig, merchantId, revenueConfig, token]);

  const handleAiConfigure = useCallback(async () => {
    if (!merchantId || !token || !isOwner) {
      return;
    }
    setAiConfiguring(true);
    setErrorMessage('');
    setNoticeMessage('');
    try {
      const result = await recommendRevenueStrategyConfig({
        merchantId,
        token,
      });
      await setRevenueStrategyConfig({
        merchantId,
        token,
        config: result.recommendedConfig,
      });
      setNoticeMessage('AI配置建议已应用到当前营销策略。');
      await loadRevenueConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI辅助配置失败';
      setErrorMessage(message);
    } finally {
      setAiConfiguring(false);
    }
  }, [isOwner, loadRevenueConfig, merchantId, token]);

  const handleGenerateProposal = useCallback(async () => {
    if (!merchantId || !token) {
      return;
    }
    const intent = String(aiIntentDraft || '').trim() || latestUserIntent;
    if (!intent) {
      setErrorMessage('请先输入意图，或先发送一次 AI 对话。');
      return;
    }
    setProposalGenerating(true);
    setErrorMessage('');
    setNoticeMessage('');
    try {
      const generated = await generateAgentProposal({
        merchantId,
        token,
        intent,
      });
      const proposalId = String(generated.proposal?.proposalId || '').trim();
      if (!proposalId) {
        throw new Error('提案生成失败');
      }
      if (isOwner) {
        await decideAgentProposal({
          merchantId,
          token,
          proposalId,
          decision: 'APPROVE',
        });
        setNoticeMessage('AI提案已自动启用，可在下方开关或停用。');
      } else {
        setNoticeMessage('AI提案已生成，当前角色不可自动启用，请 OWNER 处理。');
      }
      if (proposalStatusFilter !== 'ALL') {
        setProposalStatusFilter('ALL');
      }
      await Promise.all([loadProposalList(), loadLifecycleLibrary(), loadPolicies()]);
      setSelectedProposalId(proposalId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '提案生成失败';
      setErrorMessage(message);
    } finally {
      setProposalGenerating(false);
    }
  }, [aiIntentDraft, isOwner, latestUserIntent, loadLifecycleLibrary, loadPolicies, loadProposalList, merchantId, proposalStatusFilter, token]);

  const handleToggleProposal = useCallback(async (proposal: AgentProposalReviewItem) => {
    if (!merchantId || !token || !isOwner) {
      return;
    }
    const status = String(proposal.status || '').trim().toUpperCase();
    const policyId = String(proposal.policyId || '').trim();
    setProposalActionKey(`toggle_${proposal.proposalId}`);
    setErrorMessage('');
    setNoticeMessage('');
    try {
      if (status === 'PUBLISHED' && policyId) {
        const policy = policyMap[policyId];
        const policyStatus = String(policy?.status || '').trim().toUpperCase();
        if (policyStatus === 'PAUSED') {
          await resumePolicy({
            merchantId,
            token,
            policyId,
          });
          setNoticeMessage('策略已启用。');
        } else {
          await pausePolicy({
            merchantId,
            token,
            policyId,
            reason: 'merchant_manual_toggle_off',
          });
          setNoticeMessage('策略已停用。');
        }
      } else {
        await decideAgentProposal({
          merchantId,
          token,
          proposalId: proposal.proposalId,
          decision: 'APPROVE',
        });
        setNoticeMessage('策略已启用。');
      }
      await Promise.all([loadProposalList(), loadLifecycleLibrary(), loadPolicies()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '策略开关更新失败';
      setErrorMessage(message);
    } finally {
      setProposalActionKey('');
    }
  }, [isOwner, loadLifecycleLibrary, loadPolicies, loadProposalList, merchantId, policyMap, token]);

  const handleDeleteProposal = useCallback(async (proposal: AgentProposalReviewItem) => {
    if (!merchantId || !token || !isOwner) {
      return;
    }
    const status = String(proposal.status || '').trim().toUpperCase();
    if (status === 'PUBLISHED') {
      setErrorMessage('已启用策略不可直接删除，请先停用。');
      return;
    }
    setProposalActionKey(`delete_${proposal.proposalId}`);
    setErrorMessage('');
    setNoticeMessage('');
    try {
      await decideAgentProposal({
        merchantId,
        token,
        proposalId: proposal.proposalId,
        decision: 'REJECT',
        reason: 'merchant_delete',
      });
      setNoticeMessage('提案已删除。');
      await loadProposalList();
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除提案失败';
      setErrorMessage(message);
    } finally {
      setProposalActionKey('');
    }
  }, [isOwner, loadProposalList, merchantId, token]);

  return (
    <AppShell>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <SurfaceCard>
          <Text style={styles.sectionTitle}>营销助手</Text>
          <Text style={styles.metaText}>围绕获客、激活、活跃、扩收、留存五阶段，执行“配置-提案-开关-复盘”。</Text>
          <View style={styles.grid}>
            <StatTile label="阶段总数" value={lifecycleItems.length} />
            <StatTile label="已启用" value={activeLifecycleCount} />
            <StatTile label="待处理提案" value={proposalItems.filter((item) => item.status !== 'PUBLISHED').length} />
          </View>
          <View style={styles.grid}>
            <StatTile label="预算上限" value={Math.floor(Number(merchantState.budgetCap) || 0)} />
            <StatTile label="预算已用" value={Math.floor(Number(merchantState.budgetUsed) || 0)} />
            <StatTile label="提醒红点" value={dots.marketingUnread} />
          </View>
          <View style={styles.actionRow}>
            <ActionButton
              label="AI主动巡检"
              icon="radar"
              variant="secondary"
              onPress={() => {
                void onTriggerProactiveScan();
              }}
            />
            <ActionButton
              label="刷新"
              icon="refresh"
              variant="secondary"
              onPress={() => {
                void loadAll();
              }}
              disabled={loading}
            />
          </View>
          {!isOwner ? <Text style={styles.metaText}>当前角色为只读，开关/删除操作需 OWNER 权限。</Text> : null}
          {loading ? <Text style={styles.metaText}>营销数据加载中...</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {noticeMessage ? <Text style={styles.noticeText}>{noticeMessage}</Text> : null}
        </SurfaceCard>

        <SurfaceCard>
          <Text style={styles.sectionTitle}>五阶段开关</Text>
          {lifecycleItems.map((item) => {
            const busy = actingTemplateId === item.templateId;
            const stageStatus = String(item.status || '').trim().toUpperCase();
            const active = stageStatus === 'ACTIVE';
            const paused = stageStatus === 'PAUSED';
            const buttonLabel = active ? '停用' : paused ? '启用' : '启用';
            return (
              <View key={item.templateId} style={styles.listCard}>
                <Text style={styles.itemTitle}>{toStageText(item.stage)} · {item.templateName || item.templateId}</Text>
                <Text style={styles.metaText}>状态：{strategyStatusLabel(item.status)}</Text>
                <Text style={styles.metaText}>触发事件：{item.triggerEvent || '-'}</Text>
                <Text style={styles.metaText}>策略键：{item.policyKey || '-'}</Text>
                <Text style={styles.metaText}>最近策略：{item.lastPolicyId || '暂无'}</Text>
                <Text style={styles.metaText}>更新时间：{formatTimestamp(item.updatedAt || null)}</Text>
                {isOwner ? (
                  <ActionButton
                    label={busy ? '处理中...' : buttonLabel}
                    icon={busy ? 'hourglass-top' : active ? 'toggle-off' : 'toggle-on'}
                    onPress={() => {
                      void handleToggleLifecycle(item);
                    }}
                    disabled={busy || Boolean(actingTemplateId && !busy)}
                    busy={busy}
                  />
                ) : null}
              </View>
            );
          })}
        </SurfaceCard>

        <SurfaceCard>
          <Text style={styles.sectionTitle}>预算档位</Text>
          <Text style={styles.metaText}>支持手动档位切换，或一键应用 AI 推荐档位。</Text>
          <View style={styles.grid}>
            <StatTile label="券面额" value={Math.floor(Number(revenueConfig?.voucherValue || 0))} />
            <StatTile label="成本" value={Math.floor(Number(revenueConfig?.voucherCost || 0))} />
            <StatTile label="预算上限" value={Math.floor(Number(revenueConfig?.budgetCap || 0))} />
          </View>
          <View style={styles.actionRow}>
            <ActionButton
              label={applyingBudgetProfile === 'SAFE' ? '应用中...' : '稳健档'}
              icon="balance"
              variant="secondary"
              onPress={() => {
                void applyBudgetProfile('SAFE');
              }}
              disabled={!isOwner || Boolean(applyingBudgetProfile) || aiConfiguring}
              busy={applyingBudgetProfile === 'SAFE'}
            />
            <ActionButton
              label={applyingBudgetProfile === 'BALANCED' ? '应用中...' : '均衡档'}
              icon="tune"
              variant="secondary"
              onPress={() => {
                void applyBudgetProfile('BALANCED');
              }}
              disabled={!isOwner || Boolean(applyingBudgetProfile) || aiConfiguring}
              busy={applyingBudgetProfile === 'BALANCED'}
            />
            <ActionButton
              label={applyingBudgetProfile === 'GROWTH' ? '应用中...' : '增长档'}
              icon="trending-up"
              variant="secondary"
              onPress={() => {
                void applyBudgetProfile('GROWTH');
              }}
              disabled={!isOwner || Boolean(applyingBudgetProfile) || aiConfiguring}
              busy={applyingBudgetProfile === 'GROWTH'}
            />
          </View>
          <ActionButton
            label={aiConfiguring ? 'AI配置中...' : 'AI辅助配置'}
            icon={aiConfiguring ? 'hourglass-top' : 'auto-awesome'}
            onPress={() => {
              void handleAiConfigure();
            }}
            disabled={!isOwner || Boolean(applyingBudgetProfile) || aiConfiguring}
            busy={aiConfiguring}
          />
        </SurfaceCard>

        <SurfaceCard>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>AI提案待办</Text>
            {dots.marketingUnread > 0 ? <View style={styles.dot} /> : null}
          </View>
          <Text style={styles.metaText}>AI 提案默认自动尝试启用。你可以随时停用或删除。</Text>
          <TextInput
            value={aiIntentDraft}
            onChangeText={setAiIntentDraft}
            placeholder="例如：本周提升午餐复购率"
            placeholderTextColor="#8699b2"
            multiline
            style={styles.intentInput}
          />
          <View style={styles.actionRow}>
            <ActionButton
              label={aiIntentSubmitting ? '发送中...' : '发送给AI'}
              icon={aiIntentSubmitting ? 'hourglass-top' : 'send'}
              onPress={onSendAgentMessage}
              disabled={aiIntentSubmitting || !String(aiIntentDraft || '').trim()}
              busy={aiIntentSubmitting}
            />
            <ActionButton
              label={proposalGenerating ? '生成中...' : '生成并自动启用'}
              icon={proposalGenerating ? 'hourglass-top' : 'auto-awesome'}
              onPress={() => {
                void handleGenerateProposal();
              }}
              disabled={proposalGenerating}
              busy={proposalGenerating}
            />
          </View>
          {chatSendError ? <Text style={styles.errorText}>{chatSendError}</Text> : null}

          <View style={styles.filterRow}>
            {PROPOSAL_STATUS_FILTERS.map((item) => {
              const active = item === proposalStatusFilter;
              return (
                <Pressable
                  key={item}
                  style={[styles.filterChip, active ? styles.filterChipActive : null]}
                  onPress={() => setProposalStatusFilter(item)}
                >
                  <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>
                    {proposalStatusLabel(item)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {proposalLoading ? <Text style={styles.metaText}>提案加载中...</Text> : null}
          {!proposalLoading && proposalItems.length === 0 ? (
            <Text style={styles.metaText}>当前筛选下暂无提案。</Text>
          ) : null}

          {!proposalLoading
            ? proposalItems.map((item) => {
                const selected = selectedProposalId === item.proposalId;
                const safeStatus = String(item.status || '').trim().toUpperCase();
                const policyId = String(item.policyId || '').trim();
                const policy = policyId ? policyMap[policyId] : null;
                const policyStatus = String(policy?.status || '').trim().toUpperCase();
                const canDelete = safeStatus !== 'PUBLISHED';
                const canToggle = safeStatus !== 'REJECTED';
                const toggleLabel =
                  safeStatus === 'PUBLISHED' && policyStatus !== 'PAUSED'
                    ? '停用'
                    : safeStatus === 'PUBLISHED' && policyStatus === 'PAUSED'
                      ? '启用'
                      : '启用';
                const toggleBusy = proposalActionKey === `toggle_${item.proposalId}`;
                const deleteBusy = proposalActionKey === `delete_${item.proposalId}`;
                return (
                  <Pressable
                    key={item.proposalId}
                    style={[styles.listCard, selected ? styles.listCardActive : null]}
                    onPress={() => setSelectedProposalId(item.proposalId)}
                  >
                    <Text style={styles.itemTitle}>{item.title || item.proposalId}</Text>
                    <Text style={styles.metaText}>状态：{proposalStatusLabel(item.status)}</Text>
                    <Text style={styles.metaText}>策略键：{item.policyKey || '-'}</Text>
                    <Text style={styles.metaText}>创建时间：{formatTimestamp(item.createdAt)}</Text>
                    {selected ? (
                      <View style={styles.actionRow}>
                        {isOwner && canToggle ? (
                          <ActionButton
                            label={toggleBusy ? '处理中...' : toggleLabel}
                            icon={toggleBusy ? 'hourglass-top' : toggleLabel === '停用' ? 'toggle-off' : 'toggle-on'}
                            onPress={() => {
                              void handleToggleProposal(item);
                            }}
                            disabled={Boolean(proposalActionKey && !toggleBusy)}
                            busy={toggleBusy}
                          />
                        ) : null}
                        {isOwner && canDelete ? (
                          <ActionButton
                            label={deleteBusy ? '删除中...' : '删除'}
                            icon={deleteBusy ? 'hourglass-top' : 'delete'}
                            variant="danger"
                            onPress={() => {
                              void handleDeleteProposal(item);
                            }}
                            disabled={Boolean(proposalActionKey && !deleteBusy)}
                            busy={deleteBusy}
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            : null}
        </SurfaceCard>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: mqTheme.spacing.xl,
    gap: mqTheme.spacing.md,
  },
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
  },
  metaText: {
    ...mqTheme.typography.caption,
    color: '#405674',
  },
  errorText: {
    ...mqTheme.typography.caption,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  noticeText: {
    ...mqTheme.typography.caption,
    color: '#1a6a2f',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
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
  listCardActive: {
    borderColor: '#9fbef0',
    backgroundColor: '#f7fbff',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: mqTheme.colors.ink,
  },
  intentInput: {
    borderRadius: mqTheme.radius.md,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    backgroundColor: '#ffffff',
    minHeight: 74,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: mqTheme.colors.ink,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: mqTheme.radius.pill,
    borderWidth: 1,
    borderColor: '#c7d8f3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f4f8ff',
  },
  filterChipActive: {
    borderColor: mqTheme.colors.primary,
    backgroundColor: '#e6efff',
  },
  filterText: {
    fontSize: 12,
    color: '#41597a',
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#123d75',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4d4f',
  },
});
