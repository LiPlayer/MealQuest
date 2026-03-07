import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import StatTile from '../components/ui/StatTile';
import { useMerchant } from '../context/MerchantContext';
import {
  AgentProposalReviewItem,
  AgentProposalStatus,
  decideAgentProposal,
  evaluateAgentProposal,
  generateAgentProposal,
  getAgentProposalDetail,
  getAgentProposalReviews,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

const PROPOSAL_STATUS_FILTERS: AgentProposalStatus[] = ['ALL', 'PENDING', 'APPROVED', 'PUBLISHED', 'REJECTED'];

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

function proposalStatusLabel(status: AgentProposalStatus | string): string {
  const safeStatus = String(status || '').trim().toUpperCase();
  if (safeStatus === 'PENDING') {
    return '待决策';
  }
  if (safeStatus === 'APPROVED') {
    return '已同意待发布';
  }
  if (safeStatus === 'PUBLISHED') {
    return '已发布';
  }
  if (safeStatus === 'REJECTED') {
    return '已驳回';
  }
  return '全部';
}

const RichText = ({ text, isStreaming }: { text: string; isStreaming?: boolean }) => {
  if (!text && !isStreaming) {
    return null;
  }
  return (
    <Text style={styles.messageText}>
      {text || ''}
      {isStreaming ? <Text style={styles.streamingCursor}>▍</Text> : null}
    </Text>
  );
};

export default function AgentScreen() {
  const {
    merchantState,
    aiIntentDraft,
    setAiIntentDraft,
    aiIntentSubmitting,
    chatSendPhase,
    chatSendError,
    onTriggerProactiveScan,
    refreshContractVisibility,
    onSendAgentMessage,
    onRetryMessage,
    agentMessages,
    activeAgentProgress,
    authSession,
  } = useMerchant();
  const contractVisibility = merchantState.contractVisibility;
  const modelContract = contractVisibility.modelContract;

  const scrollViewRef = useRef<ScrollView>(null);
  const [proposalStatusFilter, setProposalStatusFilter] = useState<AgentProposalStatus>('ALL');
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const [proposalNotice, setProposalNotice] = useState('');
  const [proposalItems, setProposalItems] = useState<AgentProposalReviewItem[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState('');
  const [selectedProposal, setSelectedProposal] = useState<AgentProposalReviewItem | null>(null);
  const [proposalGenerating, setProposalGenerating] = useState(false);
  const [proposalActionKey, setProposalActionKey] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const role = String(authSession?.role || '').trim().toUpperCase();
  const canEvaluate = role === 'OWNER' || role === 'MANAGER';
  const canDecide = role === 'OWNER';

  const latestUserIntent = useMemo(() => {
    for (let idx = agentMessages.length - 1; idx >= 0; idx -= 1) {
      const row = agentMessages[idx];
      if (row && row.role === 'USER' && String(row.text || '').trim()) {
        return String(row.text || '').trim();
      }
    }
    return '';
  }, [agentMessages]);

  const selectedProposalStatus = String(selectedProposal?.status || '').trim().toUpperCase();
  const selectedCanEvaluate = canEvaluate && ['PENDING', 'APPROVED'].includes(selectedProposalStatus);
  const selectedCanDecide = canDecide && ['PENDING', 'APPROVED'].includes(selectedProposalStatus);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 90);
    return () => clearTimeout(timer);
  }, [agentMessages]);

  const loadProposalDetail = useCallback(
    async (proposalId: string) => {
      if (!authSession || !authSession.token || !authSession.merchantId || !proposalId) {
        return;
      }
      try {
        const detail = await getAgentProposalDetail({
          merchantId: authSession.merchantId,
          proposalId,
          token: authSession.token,
        });
        setSelectedProposal(detail.proposal || null);
      } catch (error) {
        const message = error instanceof Error ? error.message : '提案详情加载失败';
        setProposalError(message);
      }
    },
    [authSession],
  );

  const loadProposalList = useCallback(
    async (preferredProposalId?: string) => {
      if (!authSession || !authSession.token || !authSession.merchantId) {
        setProposalItems([]);
        setSelectedProposalId('');
        setSelectedProposal(null);
        return;
      }
      setProposalLoading(true);
      setProposalError('');
      try {
        const result = await getAgentProposalReviews({
          merchantId: authSession.merchantId,
          token: authSession.token,
          status: proposalStatusFilter,
          limit: 20,
        });
        const nextItems = Array.isArray(result.items) ? result.items : [];
        setProposalItems(nextItems);
        const fallbackId = nextItems[0]?.proposalId || '';
        const nextSelectedId =
          (preferredProposalId && nextItems.some((item) => item.proposalId === preferredProposalId)
            ? preferredProposalId
            : selectedProposalId && nextItems.some((item) => item.proposalId === selectedProposalId)
              ? selectedProposalId
              : fallbackId) || '';
        setSelectedProposalId(nextSelectedId);
        if (nextSelectedId) {
          await loadProposalDetail(nextSelectedId);
        } else {
          setSelectedProposal(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '提案列表加载失败';
        setProposalError(message);
      } finally {
        setProposalLoading(false);
      }
    },
    [authSession, loadProposalDetail, proposalStatusFilter, selectedProposalId],
  );

  useEffect(() => {
    void loadProposalList();
  }, [loadProposalList]);

  const handleGenerateProposal = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setProposalError('请先登录后再生成提案。');
      return;
    }
    const intent = String(aiIntentDraft || '').trim() || latestUserIntent;
    if (!intent) {
      setProposalError('请先输入意图，或先发起一次 AI 对话。');
      return;
    }
    setProposalGenerating(true);
    setProposalError('');
    setProposalNotice('');
    try {
      const result = await generateAgentProposal({
        merchantId: authSession.merchantId,
        token: authSession.token,
        intent,
      });
      const generatedProposalId = String(result?.proposal?.proposalId || '').trim();
      setProposalNotice('提案生成成功，已进入待决策队列。');
      if (proposalStatusFilter !== 'ALL') {
        setProposalStatusFilter('ALL');
      } else {
        await loadProposalList(generatedProposalId);
      }
      if (generatedProposalId) {
        setSelectedProposalId(generatedProposalId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '提案生成失败';
      setProposalError(message);
    } finally {
      setProposalGenerating(false);
    }
  }, [aiIntentDraft, authSession, latestUserIntent, loadProposalList, proposalStatusFilter]);

  const handleEvaluateProposal = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId || !selectedProposalId) {
      return;
    }
    setProposalActionKey(`evaluate_${selectedProposalId}`);
    setProposalError('');
    setProposalNotice('');
    try {
      await evaluateAgentProposal({
        merchantId: authSession.merchantId,
        proposalId: selectedProposalId,
        token: authSession.token,
        event: String(selectedProposal?.triggerEvent || '').trim() || undefined,
      });
      setProposalNotice('评估完成，已更新可解释结果。');
      await loadProposalList(selectedProposalId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '提案评估失败';
      setProposalError(message);
    } finally {
      setProposalActionKey('');
    }
  }, [authSession, loadProposalList, selectedProposal?.triggerEvent, selectedProposalId]);

  const handleDecideProposal = useCallback(
    async (decision: 'APPROVE' | 'REJECT') => {
      if (!authSession || !authSession.token || !authSession.merchantId || !selectedProposalId) {
        return;
      }
      const safeReason = String(rejectReason || '').trim();
      if (decision === 'REJECT' && !safeReason) {
        setProposalError('驳回时请填写原因。');
        return;
      }
      setProposalActionKey(`${decision.toLowerCase()}_${selectedProposalId}`);
      setProposalError('');
      setProposalNotice('');
      try {
        const result = await decideAgentProposal({
          merchantId: authSession.merchantId,
          proposalId: selectedProposalId,
          decision,
          reason: decision === 'REJECT' ? safeReason : undefined,
          token: authSession.token,
          event: String(selectedProposal?.triggerEvent || '').trim() || undefined,
        });
        if (decision === 'APPROVE') {
          setProposalNotice('提案已同意并发布。');
        } else {
          setProposalNotice('提案已驳回并记录原因。');
          setRejectReason('');
        }
        await loadProposalList(String(result.proposalId || selectedProposalId));
      } catch (error) {
        const message = error instanceof Error ? error.message : '提案决策失败';
        setProposalError(message);
      } finally {
        setProposalActionKey('');
      }
    },
    [authSession, loadProposalList, rejectReason, selectedProposal?.triggerEvent, selectedProposalId],
  );

  return (
    <AppShell>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 18}
      >
        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <ActionButton
              testID="ai-proactive-scan"
              label="巡检"
              onPress={onTriggerProactiveScan}
              variant="secondary"
              icon="radar"
            />
          </View>

          <View testID="merchant-customer-entry-card" style={styles.customerEntryCard}>
            <Text style={styles.customerEntryTitle}>顾客入店只读视图</Text>
            <View style={styles.customerEntryGrid}>
              <StatTile label="总顾客" value={merchantState.customerEntry.totalCustomers} />
              <StatTile label="今日新增" value={merchantState.customerEntry.newCustomersToday} />
              <StatTile label="今日入店" value={merchantState.customerEntry.checkinsToday} />
            </View>
          </View>

          <View style={styles.contractStrip}>
            <View style={styles.contractStripHeader}>
              <Text style={styles.contractStripTitle}>口径快照</Text>
              <Pressable
                onPress={() => {
                  void refreshContractVisibility();
                }}
                style={styles.contractStripBtn}
              >
                <Text style={styles.contractStripBtnText}>刷新</Text>
              </Pressable>
            </View>
            <Text style={styles.contractStripText}>
              数据版本 {contractVisibility.dataContract?.version || '-'} · 模型版本 {modelContract?.version || '-'}
            </Text>
            <Text style={styles.contractStripText}>
              目标 {modelContract?.targetMetric || 'MERCHANT_LONG_TERM_VALUE_30D'} / {modelContract?.windowDays || 30}d
            </Text>
            {contractVisibility.errorMessage ? (
              <Text style={styles.contractStripError}>口径暂不可用：{contractVisibility.errorMessage}</Text>
            ) : null}
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.proposalWrap}>
          <View style={styles.proposalHeader}>
            <View style={styles.proposalTitleWrap}>
              <Text style={styles.proposalTitle}>提案决策区</Text>
              <Text style={styles.proposalSubtitle}>围绕长期价值目标，完成提案生成、评估与同意/驳回闭环。</Text>
            </View>
            <ActionButton
              label="刷新"
              icon="refresh"
              variant="secondary"
              onPress={() => {
                void loadProposalList();
              }}
              disabled={proposalLoading}
            />
          </View>

          <ActionButton
            testID="agent-generate-proposal"
            label={proposalGenerating ? '生成中...' : '按当前意图生成提案'}
            icon={proposalGenerating ? 'hourglass-top' : 'auto-awesome'}
            onPress={() => {
              void handleGenerateProposal();
            }}
            disabled={proposalGenerating}
            busy={proposalGenerating}
          />

          <View style={styles.proposalFilterWrap}>
            {PROPOSAL_STATUS_FILTERS.map((item) => {
              const active = item === proposalStatusFilter;
              return (
                <Pressable
                  key={item}
                  style={[styles.proposalFilterChip, active ? styles.proposalFilterChipActive : null]}
                  onPress={() => {
                    setProposalStatusFilter(item);
                  }}
                >
                  <Text style={[styles.proposalFilterText, active ? styles.proposalFilterTextActive : null]}>
                    {proposalStatusLabel(item)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {proposalError ? <Text style={styles.proposalErrorText}>{proposalError}</Text> : null}
          {proposalNotice ? <Text style={styles.proposalNoticeText}>{proposalNotice}</Text> : null}
          {!canEvaluate ? <Text style={styles.proposalMetaText}>当前角色仅可对话，不可评估或决策提案。</Text> : null}
          {proposalLoading ? <Text style={styles.proposalMetaText}>提案加载中...</Text> : null}
          {!proposalLoading && proposalItems.length === 0 ? (
            <Text style={styles.proposalMetaText}>当前筛选下暂无提案，可先发起意图并生成提案。</Text>
          ) : null}

          {!proposalLoading && proposalItems.length > 0 ? (
            <View style={styles.proposalListWrap}>
              {proposalItems.map((item) => {
                const selected = item.proposalId === selectedProposalId;
                return (
                  <Pressable
                    key={item.proposalId}
                    style={[styles.proposalItemCard, selected ? styles.proposalItemCardActive : null]}
                    onPress={() => {
                      setSelectedProposalId(item.proposalId);
                      setProposalNotice('');
                      setProposalError('');
                      void loadProposalDetail(item.proposalId);
                    }}
                  >
                    <Text style={styles.proposalItemTitle}>{item.title || item.proposalId}</Text>
                    <Text style={styles.proposalMetaText}>状态：{proposalStatusLabel(item.status)}</Text>
                    <Text style={styles.proposalMetaText}>
                      模板：{item.templateId || '-'} / 分支：{item.branchId || '-'}
                    </Text>
                    <Text style={styles.proposalMetaText}>创建时间：{formatTimestamp(item.createdAt)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {selectedProposal ? (
            <View style={styles.proposalDetailWrap}>
              <Text style={styles.proposalDetailTitle}>提案详情</Text>
              <Text style={styles.proposalMetaText}>标题：{selectedProposal.title || selectedProposal.proposalId}</Text>
              <Text style={styles.proposalMetaText}>当前状态：{proposalStatusLabel(selectedProposal.status)}</Text>
              <Text style={styles.proposalMetaText}>策略键：{selectedProposal.policyKey || '-'}</Text>
              <Text style={styles.proposalMetaText}>触发事件：{selectedProposal.triggerEvent || '-'}</Text>
              <Text style={styles.proposalMetaText}>评估时间：{formatTimestamp(selectedProposal.explain?.evaluatedAt || null)}</Text>
              <Text style={styles.proposalMetaText}>
                原因码：
                {Array.isArray(selectedProposal.explain?.reasonCodes) && selectedProposal.explain.reasonCodes.length
                  ? selectedProposal.explain.reasonCodes.join(' / ')
                  : '暂无'}
              </Text>
              <Text style={styles.proposalMetaText}>
                风险标记：
                {Array.isArray(selectedProposal.explain?.riskFlags) && selectedProposal.explain.riskFlags.length
                  ? selectedProposal.explain.riskFlags.join(' / ')
                  : '暂无'}
              </Text>
              {selectedProposal.status === 'REJECTED' ? (
                <Text style={styles.proposalMetaText}>驳回原因：{selectedProposal.rejectedReason || '未填写'}</Text>
              ) : null}

              <View style={styles.proposalActionWrap}>
                {selectedCanEvaluate ? (
                  <ActionButton
                    testID="agent-proposal-evaluate"
                    label={proposalActionKey === `evaluate_${selectedProposalId}` ? '评估中...' : '执行评估'}
                    icon={proposalActionKey === `evaluate_${selectedProposalId}` ? 'hourglass-top' : 'analytics'}
                    onPress={() => {
                      void handleEvaluateProposal();
                    }}
                    disabled={Boolean(proposalActionKey)}
                    busy={proposalActionKey === `evaluate_${selectedProposalId}`}
                    variant="secondary"
                  />
                ) : null}

                {selectedCanDecide ? (
                  <>
                    <ActionButton
                      testID="agent-proposal-approve"
                      label={proposalActionKey === `approve_${selectedProposalId}` ? '发布中...' : '同意并发布'}
                      icon={proposalActionKey === `approve_${selectedProposalId}` ? 'hourglass-top' : 'check-circle'}
                      onPress={() => {
                        void handleDecideProposal('APPROVE');
                      }}
                      disabled={Boolean(proposalActionKey)}
                      busy={proposalActionKey === `approve_${selectedProposalId}`}
                    />
                    <TextInput
                      testID="agent-proposal-reject-reason"
                      value={rejectReason}
                      onChangeText={setRejectReason}
                      placeholder="驳回原因（必填）"
                      placeholderTextColor="#8699b2"
                      style={styles.rejectReasonInput}
                    />
                    <ActionButton
                      testID="agent-proposal-reject"
                      label={proposalActionKey === `reject_${selectedProposalId}` ? '驳回中...' : '驳回提案'}
                      icon={proposalActionKey === `reject_${selectedProposalId}` ? 'hourglass-top' : 'cancel'}
                      onPress={() => {
                        void handleDecideProposal('REJECT');
                      }}
                      disabled={Boolean(proposalActionKey)}
                      busy={proposalActionKey === `reject_${selectedProposalId}`}
                      variant="danger"
                    />
                  </>
                ) : null}
              </View>

              {canEvaluate && !canDecide ? (
                <Text style={styles.proposalMetaText}>当前角色可评估，不可执行同意/驳回。</Text>
              ) : null}
            </View>
          ) : null}
        </SurfaceCard>

        <ScrollView
          ref={scrollViewRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {activeAgentProgress ? (
            <SurfaceCard style={styles.progressWrap}>
              <Text style={styles.progressTitle}>Agent 进度</Text>
              <Text style={styles.progressText}>
                {activeAgentProgress.phase} | {activeAgentProgress.status}
              </Text>
              <Text style={styles.progressText}>
                Token {activeAgentProgress.tokenCount} | {Math.max(0, Math.round(activeAgentProgress.elapsedMs))}ms
              </Text>
              {activeAgentProgress.error ? (
                <Text style={styles.progressError}>{activeAgentProgress.error}</Text>
              ) : null}
            </SurfaceCard>
          ) : null}

          {agentMessages.length === 0 ? (
            <SurfaceCard style={styles.emptyState}>
              <MaterialIcons name="lightbulb-outline" size={30} color="#89a0bd" />
              <Text style={styles.emptyText}>输入经营目标，启动一次以长期价值为目标、可回放的策略协作。</Text>
            </SurfaceCard>
          ) : (
            agentMessages.map((item: any) => (
              <View key={item.messageId} style={styles.messageRow}>
                <View
                  style={[
                    styles.messageBubble,
                    item.role === 'USER' ? styles.userBubble : styles.botBubble,
                  ]}
                >
                  <Text style={styles.roleLabel}>{item.role === 'USER' ? '您' : 'AI 助手'}</Text>
                  <RichText text={item.text} isStreaming={item.isStreaming} />
                  {item.role === 'USER' && item.deliveryStatus === 'failed' ? (
                    <View style={styles.failedRow}>
                      <Text style={styles.failedText}>发送失败</Text>
                      <Pressable onPress={() => onRetryMessage(item.messageId)} style={styles.retryBtn}>
                        <Text style={styles.retryText}>重试</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <SurfaceCard style={styles.composerWrap}>
          <TextInput
            testID="agent-intent-input"
            value={aiIntentDraft}
            onChangeText={setAiIntentDraft}
            placeholder="例如：帮我提升本周午餐复购率"
            placeholderTextColor="#8699b2"
            multiline
            style={styles.input}
          />

          {chatSendPhase === 'failed' ? <Text style={styles.errorText}>{chatSendError}</Text> : null}

          <ActionButton
            testID="agent-send"
            label={aiIntentSubmitting ? '发送中...' : '发送'}
            icon={aiIntentSubmitting ? 'hourglass-top' : 'send'}
            disabled={aiIntentSubmitting || !aiIntentDraft.trim()}
            busy={aiIntentSubmitting}
            onPress={onSendAgentMessage}
          />
        </SurfaceCard>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: mqTheme.spacing.sm,
  },
  heroCard: {
    marginTop: mqTheme.spacing.sm,
  },
  heroTopRow: {
    alignItems: 'flex-end',
  },
  customerEntryCard: {
    gap: mqTheme.spacing.sm,
  },
  customerEntryTitle: {
    ...mqTheme.typography.caption,
    color: '#344661',
  },
  customerEntryGrid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  contractStrip: {
    borderWidth: 1,
    borderColor: '#c8daf7',
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#edf4ff',
    padding: mqTheme.spacing.sm,
    gap: 4,
  },
  contractStripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contractStripTitle: {
    fontSize: 12,
    color: '#1f4fbf',
    fontWeight: '700',
  },
  contractStripBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: mqTheme.radius.pill,
    borderWidth: 1,
    borderColor: '#b0c8ee',
    backgroundColor: '#ffffff',
  },
  contractStripBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#325e95',
  },
  contractStripText: {
    fontSize: 12,
    color: '#325e95',
  },
  contractStripError: {
    fontSize: 12,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  proposalWrap: {
    gap: mqTheme.spacing.sm,
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: mqTheme.spacing.sm,
  },
  proposalTitleWrap: {
    flex: 1,
    gap: 2,
  },
  proposalTitle: {
    ...mqTheme.typography.sectionTitle,
    fontSize: 16,
  },
  proposalSubtitle: {
    ...mqTheme.typography.caption,
    color: '#435571',
  },
  proposalFilterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  proposalFilterChip: {
    borderWidth: 1,
    borderColor: '#d0dbed',
    borderRadius: mqTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
  },
  proposalFilterChipActive: {
    borderColor: '#8ab4ff',
    backgroundColor: '#edf4ff',
  },
  proposalFilterText: {
    fontSize: 12,
    color: '#4d5e77',
    fontWeight: '600',
  },
  proposalFilterTextActive: {
    color: '#2e63c4',
  },
  proposalListWrap: {
    gap: mqTheme.spacing.sm,
  },
  proposalItemCard: {
    borderWidth: 1,
    borderColor: '#d4dfef',
    backgroundColor: '#ffffff',
    borderRadius: mqTheme.radius.md,
    padding: mqTheme.spacing.sm,
    gap: 2,
  },
  proposalItemCardActive: {
    borderColor: '#8ab4ff',
    backgroundColor: '#f1f6ff',
  },
  proposalItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c2f49',
  },
  proposalMetaText: {
    fontSize: 12,
    color: '#536681',
  },
  proposalErrorText: {
    fontSize: 12,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  proposalNoticeText: {
    fontSize: 12,
    color: '#1f6e43',
    fontWeight: '700',
  },
  proposalDetailWrap: {
    borderWidth: 1,
    borderColor: '#dbe5f4',
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#fbfdff',
    padding: mqTheme.spacing.sm,
    gap: 3,
  },
  proposalDetailTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2a3e5c',
  },
  proposalActionWrap: {
    marginTop: mqTheme.spacing.xs,
    gap: mqTheme.spacing.sm,
  },
  rejectReasonInput: {
    borderWidth: 1,
    borderColor: '#d6dfec',
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: mqTheme.colors.ink,
  },
  chatScroll: {
    flex: 1,
    minHeight: 0,
  },
  chatContent: {
    paddingBottom: mqTheme.spacing.sm,
    gap: mqTheme.spacing.sm,
  },
  progressWrap: {
    backgroundColor: '#edf4ff',
    borderColor: '#c6dbff',
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1f4fbf',
  },
  progressText: {
    fontSize: 12,
    color: '#325e95',
  },
  progressError: {
    marginTop: 2,
    fontSize: 12,
    color: mqTheme.colors.danger,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: mqTheme.spacing.xl,
  },
  emptyText: {
    ...mqTheme.typography.body,
    color: '#465c79',
    textAlign: 'center',
  },
  messageRow: {
    width: '100%',
  },
  messageBubble: {
    borderRadius: mqTheme.radius.lg,
    borderWidth: 1,
    padding: mqTheme.spacing.sm,
    gap: 4,
  },
  userBubble: {
    backgroundColor: '#e8f0ff',
    borderColor: '#bdd4ff',
    marginLeft: 42,
  },
  botBubble: {
    backgroundColor: '#ffffff',
    borderColor: mqTheme.colors.border,
    marginRight: 42,
  },
  roleLabel: {
    fontSize: 11,
    color: '#5d7390',
    fontWeight: '700',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: mqTheme.colors.ink,
  },
  streamingCursor: {
    color: mqTheme.colors.primary,
  },
  failedRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  failedText: {
    fontSize: 12,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: mqTheme.radius.pill,
    backgroundColor: '#fff6f7',
    borderWidth: 1,
    borderColor: '#ffd3d9',
  },
  retryText: {
    fontSize: 12,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  composerWrap: {
    marginBottom: mqTheme.spacing.sm,
    gap: mqTheme.spacing.sm,
  },
  input: {
    minHeight: 72,
    maxHeight: 150,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: mqTheme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    color: mqTheme.colors.ink,
    textAlignVertical: 'top',
  },
  errorText: {
    color: mqTheme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
});
