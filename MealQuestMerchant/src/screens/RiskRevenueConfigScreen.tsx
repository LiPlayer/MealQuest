import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import StatTile from '../components/ui/StatTile';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import {
  ExperimentConfigResponse,
  ExperimentMetricsResponse,
  GovernanceOverviewResponse,
  PolicyRecord,
  RevenueStrategyConfig,
  RevenueStrategyRecommendationResponse,
  getExperimentConfig,
  getExperimentMetrics,
  getPolicies,
  getPolicyGovernanceOverview,
  getRevenueStrategyConfig,
  pausePolicy,
  recommendRevenueStrategyConfig,
  rollbackExperiment,
  resumePolicy,
  setExperimentConfig,
  setMerchantKillSwitch,
  setRevenueStrategyConfig,
} from '../services/apiClient';
import {
  RevenueConfigDraft,
  parseTrafficPercent,
  toRevenueConfigPayload,
} from '../services/riskConfigGuards';
import { mqTheme } from '../theme/tokens';

function toDraft(config: RevenueStrategyConfig): RevenueConfigDraft {
  return {
    minOrderAmount: String(config.minOrderAmount),
    voucherValue: String(config.voucherValue),
    voucherCost: String(config.voucherCost),
    budgetCap: String(config.budgetCap),
    frequencyWindowSec: String(config.frequencyWindowSec),
    frequencyMaxHits: String(config.frequencyMaxHits),
    inventorySku: String(config.inventorySku || ''),
    inventoryMaxUnits: String(config.inventoryMaxUnits),
  };
}

function formatPercent(value: number, digits = 1): string {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return '-';
  }
  return `${(safe * 100).toFixed(digits)}%`;
}

function formatExperimentStatus(value: string): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'RUNNING') {
    return '运行中';
  }
  if (normalized === 'PAUSED') {
    return '已暂停';
  }
  if (normalized === 'DRAFT') {
    return '草稿';
  }
  if (normalized === 'ROLLED_BACK') {
    return '已回滚';
  }
  return normalized || '-';
}

function formatExperimentRiskStatus(value: string): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PASS') {
    return '通过';
  }
  if (normalized === 'FAIL') {
    return '未通过';
  }
  if (normalized === 'UNKNOWN') {
    return '未知';
  }
  return normalized || '-';
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        keyboardType={keyboardType}
        placeholderTextColor="#8093ab"
      />
    </View>
  );
}

export default function RiskRevenueConfigScreen() {
  const { authSession, merchantState } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [draft, setDraft] = useState<RevenueConfigDraft | null>(null);
  const [configError, setConfigError] = useState('');
  const [configNotice, setConfigNotice] = useState('');
  const [riskError, setRiskError] = useState('');
  const [riskNotice, setRiskNotice] = useState('');
  const [riskActionId, setRiskActionId] = useState('');
  const [recommendation, setRecommendation] = useState<RevenueStrategyRecommendationResponse | null>(null);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [overview, setOverview] = useState<GovernanceOverviewResponse | null>(null);
  const [policyRows, setPolicyRows] = useState<PolicyRecord[]>([]);
  const [experimentLoading, setExperimentLoading] = useState(false);
  const [experimentSaving, setExperimentSaving] = useState(false);
  const [experimentRollingBack, setExperimentRollingBack] = useState(false);
  const [experimentConfig, setExperimentConfigState] = useState<ExperimentConfigResponse | null>(null);
  const [experimentMetrics, setExperimentMetrics] = useState<ExperimentMetricsResponse | null>(null);
  const [experimentEnabledDraft, setExperimentEnabledDraft] = useState(false);
  const [experimentTrafficDraft, setExperimentTrafficDraft] = useState('0');
  const [experimentRollbackReason, setExperimentRollbackReason] = useState('');
  const [experimentError, setExperimentError] = useState('');
  const [experimentNotice, setExperimentNotice] = useState('');

  const loadConfig = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setConfigError('');
    try {
      const result = await getRevenueStrategyConfig({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      setDraft(toDraft(result.config));
      setPolicyId(result.policyId);
      setUpdatedAt(result.updatedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'load revenue config failed';
      setConfigError(message);
    } finally {
      setLoading(false);
    }
  }, [authSession]);

  const loadRiskSnapshot = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setRiskLoading(false);
      return;
    }
    setRiskLoading(true);
    setRiskError('');
    try {
      const [overviewResult, policiesResult] = await Promise.all([
        getPolicyGovernanceOverview({
          merchantId: authSession.merchantId,
          token: authSession.token,
        }),
        getPolicies({
          merchantId: authSession.merchantId,
          token: authSession.token,
          includeInactive: true,
        }),
      ]);
      setOverview(overviewResult);
      setPolicyRows(Array.isArray(policiesResult.items) ? policiesResult.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'load risk snapshot failed';
      setRiskError(message);
    } finally {
      setRiskLoading(false);
    }
  }, [authSession]);

  const loadExperimentSnapshot = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setExperimentLoading(false);
      return;
    }
    setExperimentLoading(true);
    setExperimentError('');
    try {
      const [configResult, metricsResult] = await Promise.all([
        getExperimentConfig({
          merchantId: authSession.merchantId,
          token: authSession.token,
        }),
        getExperimentMetrics({
          merchantId: authSession.merchantId,
          token: authSession.token,
        }),
      ]);
      setExperimentConfigState(configResult);
      setExperimentMetrics(metricsResult);
      setExperimentEnabledDraft(Boolean(configResult.enabled));
      setExperimentTrafficDraft(String(Math.floor(Number(configResult.trafficPercent) || 0)));
    } catch (error) {
      const message = error instanceof Error ? error.message : '实验快照加载失败';
      setExperimentError(message);
      setExperimentConfigState(null);
      setExperimentMetrics(null);
    } finally {
      setExperimentLoading(false);
    }
  }, [authSession]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadRiskSnapshot();
  }, [loadRiskSnapshot]);

  useEffect(() => {
    void loadExperimentSnapshot();
  }, [loadExperimentSnapshot]);

  const revenueTopReason = merchantState.revenueUpsellSummary.topBlockedReasons[0];
  const revenueLatest = merchantState.revenueUpsellSummary.latestResults[0];
  const inventoryConsumed24h = merchantState.revenueUpsellSummary.hitCount24h;

  const recommendationSummary = useMemo(() => {
    if (!recommendation) {
      return null;
    }
    return {
      aov: recommendation.salesSnapshot.aov,
      ordersPaidCount: recommendation.salesSnapshot.ordersPaidCount,
      netRevenue: recommendation.salesSnapshot.netRevenue,
    };
  }, [recommendation]);

  const isOwner = String(authSession?.role || '').toUpperCase() === 'OWNER';
  const latestRollback = experimentMetrics?.rollback?.history?.[0] || null;

  const updateDraftField = (key: keyof RevenueConfigDraft, value: string) => {
    setDraft((prev) => ({
      ...(prev || {
        minOrderAmount: '',
        voucherValue: '',
        voucherCost: '',
        budgetCap: '',
        frequencyWindowSec: '',
        frequencyMaxHits: '',
        inventorySku: '',
        inventoryMaxUnits: '',
      }),
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (!authSession || !authSession.token || !authSession.merchantId || !draft) {
      return;
    }
    setConfigError('');
    setConfigNotice('');
    setSaving(true);
    try {
      const payload = toRevenueConfigPayload(draft);
      const result = await setRevenueStrategyConfig({
        merchantId: authSession.merchantId,
        token: authSession.token,
        config: payload,
      });
      setDraft(toDraft(result.config));
      setPolicyId(result.policyId);
      setUpdatedAt(result.updatedAt);
      setConfigNotice('Revenue strategy config saved and published.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'save revenue config failed';
      setConfigError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRecommend = async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      return;
    }
    setConfigError('');
    setConfigNotice('');
    setRecommending(true);
    try {
      const result = await recommendRevenueStrategyConfig({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      setRecommendation(result);
      setConfigNotice('Agent recommendation generated. You can apply and then save.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'recommend revenue config failed';
      setConfigError(message);
    } finally {
      setRecommending(false);
    }
  };

  const handleApplyRecommendation = () => {
    if (!recommendation) {
      return;
    }
    setDraft(toDraft(recommendation.recommendedConfig));
    setConfigNotice('Recommendation applied to draft. Save to publish.');
    setConfigError('');
  };

  const handleKillSwitch = async (enabled: boolean) => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      return;
    }
    setRiskActionId(enabled ? 'kill-switch-enable' : 'kill-switch-disable');
    setRiskError('');
    setRiskNotice('');
    try {
      await setMerchantKillSwitch({
        merchantId: authSession.merchantId,
        token: authSession.token,
        enabled,
      });
      setRiskNotice(enabled ? '已开启紧急停机，策略执行将被拦截。' : '已关闭紧急停机，策略可恢复执行。');
      await loadRiskSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'set kill switch failed';
      setRiskError(message);
    } finally {
      setRiskActionId('');
    }
  };

  const handlePauseResumePolicy = async (policy: PolicyRecord) => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      return;
    }
    const policyIdValue = String(policy.policy_id || '').trim();
    if (!policyIdValue) {
      return;
    }
    setRiskActionId(policyIdValue);
    setRiskError('');
    setRiskNotice('');
    try {
      const status = String(policy.status || '').trim().toUpperCase();
      if (status === 'PUBLISHED') {
        await pausePolicy({
          merchantId: authSession.merchantId,
          policyId: policyIdValue,
          token: authSession.token,
          reason: 'owner_manual_pause',
        });
        setRiskNotice(`已暂停策略：${policy.policy_key || policyIdValue}`);
      } else if (status === 'PAUSED') {
        await resumePolicy({
          merchantId: authSession.merchantId,
          policyId: policyIdValue,
          token: authSession.token,
        });
        setRiskNotice(`已恢复策略：${policy.policy_key || policyIdValue}`);
      }
      await loadRiskSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'policy status update failed';
      setRiskError(message);
    } finally {
      setRiskActionId('');
    }
  };

  const handleSaveExperimentConfig = async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      return;
    }
    setExperimentSaving(true);
    setExperimentError('');
    setExperimentNotice('');
    try {
      const trafficPercent = parseTrafficPercent(experimentTrafficDraft);
      const payload = await setExperimentConfig({
        merchantId: authSession.merchantId,
        token: authSession.token,
        enabled: experimentEnabledDraft,
        trafficPercent,
      });
      setExperimentConfigState(payload);
      setExperimentEnabledDraft(Boolean(payload.enabled));
      setExperimentTrafficDraft(String(Math.floor(Number(payload.trafficPercent) || 0)));
      setExperimentNotice('实验配置已更新。');
      const latestMetrics = await getExperimentMetrics({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      setExperimentMetrics(latestMetrics);
    } catch (error) {
      const message = error instanceof Error ? error.message : '实验配置保存失败';
      setExperimentError(message);
    } finally {
      setExperimentSaving(false);
    }
  };

  const handleRollbackExperiment = async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      return;
    }
    setExperimentRollingBack(true);
    setExperimentError('');
    setExperimentNotice('');
    try {
      const payload = await rollbackExperiment({
        merchantId: authSession.merchantId,
        token: authSession.token,
        reason: experimentRollbackReason,
      });
      setExperimentConfigState(payload.config);
      setExperimentEnabledDraft(Boolean(payload.config.enabled));
      setExperimentTrafficDraft(String(Math.floor(Number(payload.config.trafficPercent) || 0)));
      setExperimentRollbackReason('');
      setExperimentNotice('实验已回滚，当前状态为已回滚。');
      const latestMetrics = await getExperimentMetrics({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      setExperimentMetrics(latestMetrics);
    } catch (error) {
      const message = error instanceof Error ? error.message : '实验回滚失败';
      setExperimentError(message);
    } finally {
      setExperimentRollingBack(false);
    }
  };

  return (
    <AppShell scroll>
      <SurfaceCard>
        <Text style={styles.sectionTitle}>风险治理与紧急停机</Text>
        <Text style={styles.summaryLine}>
          紧急停机：{overview?.killSwitchEnabled ? '已开启（执行拦截）' : '未开启（正常执行）'}
        </Text>
        <View style={styles.grid}>
          <Text style={styles.summaryLine}>待审批：{overview?.pendingApprovalCount ?? 0}</Text>
          <Text style={styles.summaryLine}>待发布：{overview?.approvedAwaitPublishCount ?? 0}</Text>
        </View>
        <View style={styles.grid}>
          <Text style={styles.summaryLine}>活跃策略：{overview?.activePolicyCount ?? 0}</Text>
          <Text style={styles.summaryLine}>暂停策略：{overview?.pausedPolicyCount ?? 0}</Text>
        </View>
        {!isOwner ? <Text style={styles.metaText}>当前角色仅可查看，风控开关与策略启停需 OWNER 权限。</Text> : null}
        {riskError ? <Text style={styles.errorText}>{riskError}</Text> : null}
        {riskNotice ? <Text style={styles.noticeText}>{riskNotice}</Text> : null}
        {riskLoading ? <Text style={styles.metaText}>风险治理数据加载中...</Text> : null}
        <View style={styles.actionWrap}>
          <ActionButton
            label={overview?.killSwitchEnabled ? '关闭紧急停机' : '开启紧急停机'}
            icon={riskActionId.startsWith('kill-switch') ? 'hourglass-top' : 'power-settings-new'}
            variant={overview?.killSwitchEnabled ? 'secondary' : 'danger'}
            onPress={() => {
              void handleKillSwitch(!Boolean(overview?.killSwitchEnabled));
            }}
            disabled={!isOwner || riskLoading || riskActionId.startsWith('kill-switch')}
            busy={riskActionId.startsWith('kill-switch')}
          />
          <ActionButton
            label="刷新治理状态"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              void loadRiskSnapshot();
            }}
            disabled={riskLoading || Boolean(riskActionId)}
          />
        </View>

        <Text style={styles.sectionSubTitle}>策略启停</Text>
        {policyRows.length === 0 ? (
          <Text style={styles.metaText}>当前无可管理策略。</Text>
        ) : (
          policyRows.map((item) => {
            const itemStatus = String(item.status || '').toUpperCase();
            const canToggle = itemStatus === 'PUBLISHED' || itemStatus === 'PAUSED';
            const itemBusy = riskActionId === item.policy_id;
            return (
              <View key={item.policy_id} style={styles.policyRow}>
                <Text style={styles.policyTitle}>{item.name || item.policy_key || item.policy_id}</Text>
                <Text style={styles.metaText}>状态：{itemStatus || '-'}</Text>
                <Text style={styles.metaText}>policyId：{item.policy_id}</Text>
                <Text style={styles.metaText}>更新时间：{item.updated_at || item.published_at || '暂无'}</Text>
                {canToggle ? (
                  <ActionButton
                    label={itemBusy ? '处理中...' : itemStatus === 'PUBLISHED' ? '暂停策略' : '恢复策略'}
                    icon={itemBusy ? 'hourglass-top' : itemStatus === 'PUBLISHED' ? 'pause-circle' : 'play-circle'}
                    variant={itemStatus === 'PUBLISHED' ? 'danger' : 'secondary'}
                    onPress={() => {
                      void handlePauseResumePolicy(item);
                    }}
                    disabled={!isOwner || itemBusy || Boolean(riskActionId && !itemBusy)}
                    busy={itemBusy}
                  />
                ) : null}
              </View>
            );
          })
        )}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>实验与灰度监控</Text>
        {!isOwner ? (
          <Text style={styles.metaText}>当前角色为只读，可查看实验收益与风险状态。</Text>
        ) : null}
        {experimentError ? <Text style={styles.errorText}>{experimentError}</Text> : null}
        {experimentNotice ? <Text style={styles.noticeText}>{experimentNotice}</Text> : null}
        {experimentLoading ? <Text style={styles.metaText}>实验数据加载中...</Text> : null}
        {experimentConfig ? (
          <>
            <View style={styles.grid}>
              <StatTile label="实验状态" value={formatExperimentStatus(experimentConfig.status)} />
              <StatTile label="实验开关" value={experimentConfig.enabled ? '开启' : '关闭'} />
              <StatTile label="流量占比" value={`${Math.floor(Number(experimentConfig.trafficPercent) || 0)}%`} />
            </View>
            <View style={styles.grid}>
              <StatTile label="目标事件" value={experimentConfig.targetEvent} />
              <StatTile label="优化模式" value={experimentConfig.optimizationMode} />
              <StatTile label="风险状态" value={formatExperimentRiskStatus(experimentMetrics?.risk?.status || 'UNKNOWN')} />
            </View>
            <Text style={styles.metaText}>
              指标口径：{Array.isArray(experimentConfig.primaryMetrics) ? experimentConfig.primaryMetrics.join(' / ') : '-'}
            </Text>
            <Text style={styles.metaText}>
              最近更新：{experimentConfig.updatedAt ? new Date(experimentConfig.updatedAt).toLocaleString() : '暂无'}
              {experimentConfig.updatedBy ? ` · ${experimentConfig.updatedBy}` : ''}
            </Text>
            <Text style={styles.metaText}>
              最近回滚：{experimentConfig.lastRollbackAt ? new Date(experimentConfig.lastRollbackAt).toLocaleString() : '暂无'}
              {experimentConfig.lastRollbackBy ? ` · ${experimentConfig.lastRollbackBy}` : ''}
            </Text>

            {experimentMetrics ? (
              <>
                <View style={styles.grid}>
                  <StatTile label="收入提升" value={formatPercent(experimentMetrics.uplift.merchantRevenueUplift)} />
                  <StatTile label="收益提升" value={formatPercent(experimentMetrics.uplift.merchantProfitUplift)} />
                  <StatTile label="命中率差值" value={formatPercent(experimentMetrics.uplift.upliftHitRateLift)} />
                </View>
                <View style={styles.grid}>
                  <StatTile label="Control 净收益" value={experimentMetrics.groups.control.netProfitProxy.toFixed(2)} />
                  <StatTile label="Treatment 净收益" value={experimentMetrics.groups.treatment.netProfitProxy.toFixed(2)} />
                  <StatTile label="支付成功率差值" value={formatPercent(experimentMetrics.uplift.paymentSuccessRateLift, 2)} />
                </View>
                {Array.isArray(experimentMetrics.risk.reasons) && experimentMetrics.risk.reasons.length > 0 ? (
                  <Text style={styles.warnText}>
                    风险原因：{experimentMetrics.risk.reasons.slice(0, 4).join(' / ')}
                  </Text>
                ) : null}
              </>
            ) : null}

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>trafficPercent（0-100，整数）</Text>
              <TextInput
                value={experimentTrafficDraft}
                onChangeText={setExperimentTrafficDraft}
                style={styles.input}
                keyboardType="numeric"
                editable={isOwner && !experimentSaving && !experimentRollingBack}
                placeholderTextColor="#8093ab"
              />
            </View>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>回滚原因（可选）</Text>
              <TextInput
                value={experimentRollbackReason}
                onChangeText={setExperimentRollbackReason}
                style={styles.input}
                editable={isOwner && !experimentSaving && !experimentRollingBack}
                placeholder="manual rollback"
                placeholderTextColor="#8093ab"
              />
            </View>
            {latestRollback ? (
              <Text style={styles.metaText}>
                最近回滚记录：{latestRollback.rollbackId} · {latestRollback.reason}
              </Text>
            ) : null}
            <View style={styles.actionWrap}>
              <ActionButton
                label={experimentEnabledDraft ? '切换为暂停态' : '切换为运行态'}
                icon="tune"
                variant="secondary"
                onPress={() => {
                  setExperimentEnabledDraft((prev) => !prev);
                }}
                disabled={!isOwner || experimentSaving || experimentRollingBack}
              />
              <ActionButton
                label={experimentSaving ? '保存中...' : '保存实验配置'}
                icon={experimentSaving ? 'hourglass-top' : 'save'}
                onPress={() => {
                  void handleSaveExperimentConfig();
                }}
                disabled={!isOwner || experimentSaving || experimentRollingBack}
                busy={experimentSaving}
              />
              <ActionButton
                label={experimentRollingBack ? '回滚中...' : '一键回滚实验'}
                icon={experimentRollingBack ? 'hourglass-top' : 'restore'}
                variant="danger"
                onPress={() => {
                  void handleRollbackExperiment();
                }}
                disabled={!isOwner || experimentSaving || experimentRollingBack}
                busy={experimentRollingBack}
              />
              <ActionButton
                label="刷新实验状态"
                icon="refresh"
                variant="secondary"
                onPress={() => {
                  void loadExperimentSnapshot();
                }}
                disabled={experimentSaving || experimentRollingBack || experimentLoading}
              />
            </View>
          </>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>24h 执行摘要</Text>
        <Text style={styles.summaryLine}>命中：{merchantState.revenueUpsellSummary.hitCount24h}</Text>
        <Text style={styles.summaryLine}>拦截：{merchantState.revenueUpsellSummary.blockedCount24h}</Text>
        <Text style={styles.summaryLine}>库存消耗（估算）：{inventoryConsumed24h}</Text>
        <Text style={styles.summaryLine}>
          {revenueTopReason && revenueTopReason.reason
            ? `Top 拦截原因：${revenueTopReason.reason}（${revenueTopReason.count}）`
            : 'Top 拦截原因：暂无'}
        </Text>
        <Text style={styles.summaryLine}>
          {revenueLatest && revenueLatest.outcome
            ? `最近结果：${revenueLatest.outcome}${revenueLatest.reasonCode ? ` · ${revenueLatest.reasonCode}` : ''}`
            : '最近结果：暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>策略参数</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading config...</Text>
          </View>
        ) : draft ? (
          <>
            <Field
              label="minOrderAmount"
              value={draft.minOrderAmount}
              onChangeText={(value) => updateDraftField('minOrderAmount', value)}
              keyboardType="decimal-pad"
            />
            <Field
              label="voucherValue"
              value={draft.voucherValue}
              onChangeText={(value) => updateDraftField('voucherValue', value)}
              keyboardType="decimal-pad"
            />
            <Field
              label="voucherCost"
              value={draft.voucherCost}
              onChangeText={(value) => updateDraftField('voucherCost', value)}
              keyboardType="decimal-pad"
            />
            <Field
              label="budgetCap"
              value={draft.budgetCap}
              onChangeText={(value) => updateDraftField('budgetCap', value)}
              keyboardType="decimal-pad"
            />
            <Field
              label="frequencyWindowSec"
              value={draft.frequencyWindowSec}
              onChangeText={(value) => updateDraftField('frequencyWindowSec', value)}
              keyboardType="numeric"
            />
            <Field
              label="frequencyMaxHits"
              value={draft.frequencyMaxHits}
              onChangeText={(value) => updateDraftField('frequencyMaxHits', value)}
              keyboardType="numeric"
            />
            <Field
              label="inventorySku"
              value={draft.inventorySku}
              onChangeText={(value) => updateDraftField('inventorySku', value)}
            />
            <Field
              label="inventoryMaxUnits"
              value={draft.inventoryMaxUnits}
              onChangeText={(value) => updateDraftField('inventoryMaxUnits', value)}
              keyboardType="numeric"
            />
          </>
        ) : (
          <Text style={styles.summaryLine}>Config unavailable.</Text>
        )}

        <Text style={styles.metaText}>policyId: {policyId || 'not published'}</Text>
        <Text style={styles.metaText}>updatedAt: {updatedAt || 'n/a'}</Text>
        {configError ? <Text style={styles.errorText}>{configError}</Text> : null}
        {configNotice ? <Text style={styles.noticeText}>{configNotice}</Text> : null}

        <View style={styles.actionWrap}>
          <ActionButton
            label={saving ? '保存中...' : '保存并发布'}
            icon={saving ? 'hourglass-top' : 'save'}
            onPress={handleSave}
            disabled={loading || !draft || saving}
            busy={saving}
          />
          <ActionButton
            label={recommending ? '生成中...' : 'Agent 建议'}
            icon={recommending ? 'hourglass-top' : 'auto-awesome'}
            variant="secondary"
            onPress={handleRecommend}
            disabled={loading || recommending}
            busy={recommending}
          />
          {recommendation ? (
            <ActionButton
              label="应用建议到草稿"
              icon="tips-and-updates"
              variant="secondary"
              onPress={handleApplyRecommendation}
              disabled={loading}
            />
          ) : null}
          <ActionButton
            label="刷新"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              void loadConfig();
            }}
            disabled={loading}
          />
        </View>
      </SurfaceCard>

      {recommendation ? (
        <SurfaceCard>
          <Text style={styles.sectionTitle}>Agent 推荐参数</Text>
          {recommendationSummary ? (
            <>
              <Text style={styles.summaryLine}>近样本客单价（AOV）：{recommendationSummary.aov}</Text>
              <Text style={styles.summaryLine}>近样本支付单数：{recommendationSummary.ordersPaidCount}</Text>
              <Text style={styles.summaryLine}>近样本净收入：{recommendationSummary.netRevenue}</Text>
            </>
          ) : null}
          {recommendation.rationale.map((reason) => (
            <Text style={styles.summaryLine} key={reason}>
              - {reason}
            </Text>
          ))}
        </SurfaceCard>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
  },
  sectionSubTitle: {
    ...mqTheme.typography.caption,
    color: '#3c5373',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  summaryLine: {
    ...mqTheme.typography.body,
    color: '#2e425e',
  },
  fieldWrap: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3c5373',
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
  actionWrap: {
    gap: mqTheme.spacing.sm,
    marginTop: 4,
  },
  loadingWrap: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  loadingText: {
    ...mqTheme.typography.caption,
  },
  metaText: {
    ...mqTheme.typography.caption,
    color: '#5b6f8f',
  },
  warnText: {
    ...mqTheme.typography.caption,
    color: '#855e1d',
    fontWeight: '700',
  },
  policyRow: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#ffffff',
    padding: mqTheme.spacing.sm,
    gap: 4,
  },
  policyTitle: {
    ...mqTheme.typography.body,
    color: mqTheme.colors.ink,
    fontWeight: '700',
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
