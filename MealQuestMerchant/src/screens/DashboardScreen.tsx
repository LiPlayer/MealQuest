import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import StatTile from '../components/ui/StatTile';
import { useMerchant } from '../context/MerchantContext';
import {
  ExperimentConfigResponse,
  ExperimentMetricsResponse,
  ExperienceGuardPath,
  ExperienceGuardResponse,
  ReleaseGateResponse,
  getExperimentConfig,
  getExperimentMetrics,
  getCustomerExperienceGuard,
  getReleaseGateSnapshot,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

function formatGuardStatus(value: string): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'HEALTHY') {
    return '健康';
  }
  if (normalized === 'WARNING') {
    return '预警';
  }
  if (normalized === 'RISK') {
    return '风险';
  }
  if (normalized === 'NO_DATA') {
    return '无数据';
  }
  return normalized || '-';
}

function formatGuardPathMetrics(path: ExperienceGuardPath): string {
  const metrics = path && typeof path.metrics === 'object' ? path.metrics : {};
  if (path.pathKey === 'ENTRY_SESSION') {
    return `活跃:${Number(metrics.activeUsers24h) || 0} · 新增:${Number(metrics.newUsers24h) || 0}`;
  }
  if (path.pathKey === 'PAYMENT_SETTLEMENT') {
    return `成功率:${((Number(metrics.successRate24h) || 0) * 100).toFixed(1)}% · 失败:${Number(metrics.failed24h) || 0}`;
  }
  if (path.pathKey === 'ORDER_TRACE') {
    return `闭环率:${((Number(metrics.chainCompleteRate24h) || 0) * 100).toFixed(1)}% · 缺口:${Number(metrics.chainMissing24h) || 0}`;
  }
  if (path.pathKey === 'PRIVACY_ACCOUNT') {
    return `请求:${Number(metrics.requests24h) || 0} · 失败:${Number(metrics.failed24h) || 0}`;
  }
  return '';
}

function formatReleaseDecisionStatus(value: string): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'GO') {
    return '可发布';
  }
  if (normalized === 'NO_GO') {
    return '不可发布';
  }
  if (normalized === 'NEEDS_REVIEW') {
    return '需复核';
  }
  return normalized || '-';
}

function formatReleaseGateStatus(value: string): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PASS') {
    return '通过';
  }
  if (normalized === 'FAIL') {
    return '未通过';
  }
  if (normalized === 'REVIEW') {
    return '待复核';
  }
  return normalized || '-';
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

function formatPercent(value: number, digits = 1): string {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return '-';
  }
  return `${(safe * 100).toFixed(digits)}%`;
}

function formatMoney(value: number): string {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return '-';
  }
  return `¥${safe.toFixed(2)}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { authSession, merchantState, refreshContractVisibility } = useMerchant();
  const [experienceGuard, setExperienceGuard] = useState<ExperienceGuardResponse | null>(null);
  const [experienceLoading, setExperienceLoading] = useState(false);
  const [experienceError, setExperienceError] = useState('');
  const [releaseGate, setReleaseGate] = useState<ReleaseGateResponse | null>(null);
  const [releaseGateLoading, setReleaseGateLoading] = useState(false);
  const [releaseGateError, setReleaseGateError] = useState('');
  const [experimentConfig, setExperimentConfig] = useState<ExperimentConfigResponse | null>(null);
  const [experimentMetrics, setExperimentMetrics] = useState<ExperimentMetricsResponse | null>(null);
  const [experimentLoading, setExperimentLoading] = useState(false);
  const [experimentError, setExperimentError] = useState('');
  const welcomeTopReason = merchantState.acquisitionWelcomeSummary.topBlockedReasons[0];
  const welcomeLatest = merchantState.acquisitionWelcomeSummary.latestResults[0];
  const activationTopReason = merchantState.activationRecoverySummary.topBlockedReasons[0];
  const activationLatest = merchantState.activationRecoverySummary.latestResults[0];
  const engagementTopReason = merchantState.engagementSummary.topBlockedReasons[0];
  const engagementLatest = merchantState.engagementSummary.latestResults[0];
  const revenueTopReason = merchantState.revenueUpsellSummary.topBlockedReasons[0];
  const revenueLatest = merchantState.revenueUpsellSummary.latestResults[0];
  const retentionTopReason = merchantState.retentionWinbackSummary.topBlockedReasons[0];
  const retentionLatest = merchantState.retentionWinbackSummary.latestResults[0];
  const retentionRateText = `${(Math.max(0, Number(merchantState.retentionWinbackSummary.reactivationRate24h) || 0) * 100).toFixed(1)}%`;
  const latestTrace = merchantState.traceSummary.latestTrace[0];
  const contractVisibility = merchantState.contractVisibility;
  const dataContract = contractVisibility.dataContract;
  const modelContract = contractVisibility.modelContract;
  const signalFieldText = modelContract && modelContract.signalFields.length > 0
    ? modelContract.signalFields.slice(0, 5).join(' / ')
    : '暂无信号字段';
  const role = String(authSession?.role || '').trim().toUpperCase();
  const canViewGovernanceView = role === 'OWNER' || role === 'MANAGER';
  const experienceAlerts = useMemo(
    () => (Array.isArray(experienceGuard?.alerts) ? experienceGuard.alerts.slice(0, 3) : []),
    [experienceGuard?.alerts],
  );
  const experiencePaths = useMemo(
    () => (Array.isArray(experienceGuard?.paths) ? experienceGuard.paths.slice(0, 4) : []),
    [experienceGuard?.paths],
  );
  const releaseGateReasons = useMemo(
    () => (Array.isArray(releaseGate?.finalDecision?.reasons) ? releaseGate.finalDecision.reasons.slice(0, 6) : []),
    [releaseGate?.finalDecision?.reasons],
  );
  const releaseGateItemRows = useMemo(
    () => (
      releaseGate
        ? [
            { label: '业务门', gate: releaseGate.gates.businessGate },
            { label: '技术门', gate: releaseGate.gates.technicalGate },
            { label: '风控门', gate: releaseGate.gates.riskGate },
            { label: '合规门', gate: releaseGate.gates.complianceGate },
          ]
        : []
    ),
    [releaseGate],
  );
  const experimentRiskReasons = useMemo(
    () => (Array.isArray(experimentMetrics?.risk?.reasons) ? experimentMetrics.risk.reasons.slice(0, 4) : []),
    [experimentMetrics?.risk?.reasons],
  );

  const loadExperienceGuard = useCallback(async () => {
    if (!authSession || !authSession.merchantId || !authSession.token || !canViewGovernanceView) {
      return;
    }
    setExperienceLoading(true);
    setExperienceError('');
    try {
      const result = await getCustomerExperienceGuard({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      setExperienceGuard(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '顾客体验健康度加载失败';
      setExperienceError(message);
      setExperienceGuard(null);
    } finally {
      setExperienceLoading(false);
    }
  }, [authSession, canViewGovernanceView]);

  const loadReleaseGate = useCallback(async () => {
    if (!authSession || !authSession.merchantId || !authSession.token || !canViewGovernanceView) {
      return;
    }
    setReleaseGateLoading(true);
    setReleaseGateError('');
    try {
      const result = await getReleaseGateSnapshot({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      setReleaseGate(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布门数据加载失败';
      setReleaseGateError(message);
      setReleaseGate(null);
    } finally {
      setReleaseGateLoading(false);
    }
  }, [authSession, canViewGovernanceView]);

  const loadExperimentSnapshot = useCallback(async () => {
    if (!authSession || !authSession.merchantId || !authSession.token || !canViewGovernanceView) {
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
      setExperimentConfig(configResult);
      setExperimentMetrics(metricsResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : '实验数据加载失败';
      setExperimentError(message);
      setExperimentConfig(null);
      setExperimentMetrics(null);
    } finally {
      setExperimentLoading(false);
    }
  }, [authSession, canViewGovernanceView]);

  useEffect(() => {
    void loadExperienceGuard();
  }, [loadExperienceGuard]);

  useEffect(() => {
    void loadReleaseGate();
  }, [loadReleaseGate]);

  useEffect(() => {
    void loadExperimentSnapshot();
  }, [loadExperimentSnapshot]);

  return (
    <AppShell>
      <SurfaceCard>
        <Text style={styles.sectionTitle}>当前门店</Text>
        <Text style={styles.storeName}>{merchantState.merchantName || merchantState.merchantId || 'My Store'}</Text>
        <View style={styles.grid}>
          <StatTile label="总顾客" value={merchantState.customerEntry.totalCustomers} />
          <StatTile label="今日新增" value={merchantState.customerEntry.newCustomersToday} />
          <StatTile label="今日入店" value={merchantState.customerEntry.checkinsToday} />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <View style={styles.contractHeaderRow}>
          <Text style={styles.sectionTitle}>顾客体验健康度</Text>
          <Pressable
            style={styles.contractRefreshBtn}
            onPress={() => {
              void loadExperienceGuard();
            }}
          >
            <Text style={styles.contractRefreshBtnText}>刷新体验</Text>
          </Pressable>
        </View>
        {!canViewGovernanceView ? (
          <Text style={styles.hintText}>当前角色仅可查看概要，顾客体验健康度明细对 OWNER/MANAGER 开放。</Text>
        ) : null}
        {canViewGovernanceView && experienceLoading ? <Text style={styles.hintText}>体验数据加载中...</Text> : null}
        {canViewGovernanceView && experienceError ? (
          <Text style={styles.contractErrorText}>体验数据暂不可用：{experienceError}</Text>
        ) : null}
        {canViewGovernanceView && experienceGuard ? (
          <>
            <View style={styles.grid}>
              <StatTile label="总体状态" value={formatGuardStatus(experienceGuard.status)} />
              <StatTile label="健康分" value={experienceGuard.score} />
            </View>
            <View style={styles.grid}>
              <StatTile label="健康路径" value={experienceGuard.summary.healthyCount} />
              <StatTile label="预警路径" value={experienceGuard.summary.warningCount} />
              <StatTile label="风险路径" value={experienceGuard.summary.riskCount} />
            </View>
            {experiencePaths.map((item) => (
              <View key={item.pathKey} style={styles.experiencePathRow}>
                <Text style={styles.pathTitle}>{item.title} · {formatGuardStatus(item.status)}</Text>
                <Text style={styles.hintText}>{formatGuardPathMetrics(item)}</Text>
              </View>
            ))}
            {experienceAlerts.map((item) => (
              <Text key={`${item.pathKey}_${item.message}`} style={styles.contractWarnText}>
                {item.pathKey}：{item.message}
              </Text>
            ))}
            <Text style={styles.hintText}>
              最近评估：{experienceGuard.evaluatedAt ? new Date(experienceGuard.evaluatedAt).toLocaleString() : '暂无'}
            </Text>
          </>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <View style={styles.contractHeaderRow}>
          <Text style={styles.sectionTitle}>长期 KPI 与发布门</Text>
          <Pressable
            style={styles.contractRefreshBtn}
            onPress={() => {
              void loadReleaseGate();
            }}
          >
            <Text style={styles.contractRefreshBtnText}>刷新发布门</Text>
          </Pressable>
        </View>
        {!canViewGovernanceView ? (
          <Text style={styles.hintText}>当前角色仅可查看概要，发布门明细对 OWNER/MANAGER 开放。</Text>
        ) : null}
        {canViewGovernanceView && releaseGateLoading ? <Text style={styles.hintText}>发布门数据加载中...</Text> : null}
        {canViewGovernanceView && releaseGateError ? (
          <Text style={styles.contractErrorText}>发布门数据暂不可用：{releaseGateError}</Text>
        ) : null}
        {canViewGovernanceView && releaseGate ? (
          <>
            <View style={styles.grid}>
              <StatTile label="发布建议" value={formatReleaseDecisionStatus(releaseGate.finalDecision.status)} />
              <StatTile label="长期价值指数" value={Number(releaseGate.kpis.LongTermValueIndex).toFixed(3)} />
              <StatTile label="30天净收益" value={formatMoney(releaseGate.kpis.MerchantNetProfit30)} />
            </View>
            <View style={styles.grid}>
              <StatTile label="收益提升" value={formatPercent(releaseGate.kpis.MerchantProfitUplift30)} />
              <StatTile label="Uplift命中率" value={formatPercent(releaseGate.kpis.UpliftHitRate30)} />
              <StatTile label="支付成功率" value={formatPercent(releaseGate.kpis.paymentSuccessRate30, 2)} />
            </View>
            <View style={styles.grid}>
              <StatTile label="风险损失代理" value={formatPercent(releaseGate.kpis.riskLossProxy30, 2)} />
              <StatTile label="补贴浪费代理" value={formatPercent(releaseGate.kpis.SubsidyWasteProxy)} />
              <StatTile label="留存率" value={formatPercent(releaseGate.kpis.Retention30)} />
            </View>
            {releaseGateItemRows.map((row) => {
              const safeGate = row && row.gate && typeof row.gate === 'object'
                ? row.gate as { status?: string; reasons?: string[] }
                : {};
              const reasons = Array.isArray(safeGate.reasons) ? safeGate.reasons : [];
              return (
                <View key={row.label} style={styles.releaseGateRow}>
                  <Text style={styles.pathTitle}>{row.label}：{formatReleaseGateStatus(String(safeGate.status || ''))}</Text>
                  {reasons.length > 0 ? (
                    <Text style={styles.hintText}>原因：{reasons.slice(0, 3).join(' / ')}</Text>
                  ) : (
                    <Text style={styles.hintText}>原因：-</Text>
                  )}
                </View>
              );
            })}
            <Text style={styles.hintText}>
              数据充分性：{releaseGate.dataSufficiency.ready ? '已满足' : '不足（需复核）'}
            </Text>
            {!releaseGate.dataSufficiency.ready && releaseGate.dataSufficiency.reasons.length > 0 ? (
              <Text style={styles.contractWarnText}>
                样本不足原因：{releaseGate.dataSufficiency.reasons.slice(0, 4).join(' / ')}
              </Text>
            ) : null}
            {releaseGateReasons.length > 0 ? (
              <Text style={styles.contractWarnText}>
                发布建议原因：{releaseGateReasons.join(' / ')}
              </Text>
            ) : null}
            <Text style={styles.hintText}>
              最近评估：{releaseGate.evaluatedAt ? new Date(releaseGate.evaluatedAt).toLocaleString() : '暂无'}
            </Text>
          </>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <View style={styles.contractHeaderRow}>
          <Text style={styles.sectionTitle}>实验灰度摘要（S110）</Text>
          <Pressable
            style={styles.contractRefreshBtn}
            onPress={() => {
              void loadExperimentSnapshot();
            }}
          >
            <Text style={styles.contractRefreshBtnText}>刷新实验</Text>
          </Pressable>
        </View>
        {!canViewGovernanceView ? (
          <Text style={styles.hintText}>当前角色仅可查看概要，实验明细对 OWNER/MANAGER 开放。</Text>
        ) : null}
        {canViewGovernanceView && experimentLoading ? <Text style={styles.hintText}>实验数据加载中...</Text> : null}
        {canViewGovernanceView && experimentError ? (
          <Text style={styles.contractErrorText}>实验数据暂不可用：{experimentError}</Text>
        ) : null}
        {canViewGovernanceView && experimentConfig && experimentMetrics ? (
          <>
            <View style={styles.grid}>
              <StatTile label="实验状态" value={formatExperimentStatus(experimentConfig.status)} />
              <StatTile label="实验开关" value={experimentConfig.enabled ? '开启' : '关闭'} />
              <StatTile label="流量占比" value={`${Math.floor(Number(experimentConfig.trafficPercent) || 0)}%`} />
            </View>
            <View style={styles.grid}>
              <StatTile label="收益提升" value={formatPercent(experimentMetrics.uplift.merchantProfitUplift)} />
              <StatTile label="收入提升" value={formatPercent(experimentMetrics.uplift.merchantRevenueUplift)} />
              <StatTile label="风险状态" value={formatExperimentRiskStatus(experimentMetrics.risk.status)} />
            </View>
            {experimentRiskReasons.length > 0 ? (
              <Text style={styles.contractWarnText}>
                风险原因：{experimentRiskReasons.join(' / ')}
              </Text>
            ) : null}
            <Text style={styles.hintText}>
              最近回滚：{experimentMetrics.rollback.lastRollbackAt
                ? new Date(experimentMetrics.rollback.lastRollbackAt).toLocaleString()
                : '暂无'}
            </Text>
            <Text style={styles.hintText}>
              最近评估：{experimentMetrics.evaluatedAt ? new Date(experimentMetrics.evaluatedAt).toLocaleString() : '暂无'}
            </Text>
            <View style={styles.row}>
              <Pressable style={styles.linkBtn} onPress={() => router.push('/(tabs)/risk')}>
                <Text style={styles.linkBtnText}>前往风控页调整</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>Welcome 判定摘要（24h）</Text>
        <View style={styles.grid}>
          <StatTile label="命中" value={merchantState.acquisitionWelcomeSummary.hitCount24h} />
          <StatTile label="拦截" value={merchantState.acquisitionWelcomeSummary.blockedCount24h} />
        </View>
        <Text style={styles.hintText}>
          {welcomeTopReason && welcomeTopReason.reason
            ? `Top 拦截原因：${welcomeTopReason.reason}（${welcomeTopReason.count}）`
            : '当前无拦截记录。'}
        </Text>
        <Text style={styles.hintText}>
          {welcomeLatest && welcomeLatest.outcome
            ? `最近结果：${welcomeLatest.outcome}${welcomeLatest.reasonCode ? ` · ${welcomeLatest.reasonCode}` : ''}`
            : '最近结果：暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>Activation 连签激活摘要（24h）</Text>
        <View style={styles.grid}>
          <StatTile label="命中" value={merchantState.activationRecoverySummary.hitCount24h} />
          <StatTile label="拦截" value={merchantState.activationRecoverySummary.blockedCount24h} />
        </View>
        <Text style={styles.hintText}>
          {activationTopReason && activationTopReason.reason
            ? `Top 拦截原因：${activationTopReason.reason}（${activationTopReason.count}）`
            : '当前无拦截记录。'}
        </Text>
        <Text style={styles.hintText}>
          {activationLatest && activationLatest.outcome
            ? `最近结果：${activationLatest.outcome}${activationLatest.reasonCode ? ` · ${activationLatest.reasonCode}` : ''}`
            : '最近结果：暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>Engagement 活跃运营摘要（24h）</Text>
        <View style={styles.grid}>
          <StatTile label="命中" value={merchantState.engagementSummary.hitCount24h} />
          <StatTile label="拦截" value={merchantState.engagementSummary.blockedCount24h} />
        </View>
        <Text style={styles.hintText}>
          {engagementTopReason && engagementTopReason.reason
            ? `Top 拦截原因：${engagementTopReason.reason}（${engagementTopReason.count}）`
            : '当前无拦截记录。'}
        </Text>
        <Text style={styles.hintText}>
          {engagementLatest && engagementLatest.outcome
            ? `最近结果：${engagementLatest.outcome}${engagementLatest.reasonCode ? ` · ${engagementLatest.reasonCode}` : ''}`
            : '最近结果：暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>Revenue 提客单摘要（24h）</Text>
        <View style={styles.grid}>
          <StatTile label="命中" value={merchantState.revenueUpsellSummary.hitCount24h} />
          <StatTile label="拦截" value={merchantState.revenueUpsellSummary.blockedCount24h} />
        </View>
        <Text style={styles.hintText}>
          {revenueTopReason && revenueTopReason.reason
            ? `Top 拦截原因：${revenueTopReason.reason}（${revenueTopReason.count}）`
            : '当前无拦截记录。'}
        </Text>
        <Text style={styles.hintText}>
          {revenueLatest && revenueLatest.outcome
            ? `最近结果：${revenueLatest.outcome}${revenueLatest.reasonCode ? ` · ${revenueLatest.reasonCode}` : ''}`
            : '最近结果：暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>Retention 沉默召回摘要（24h）</Text>
        <View style={styles.grid}>
          <StatTile label="命中" value={merchantState.retentionWinbackSummary.hitCount24h} />
          <StatTile label="拦截" value={merchantState.retentionWinbackSummary.blockedCount24h} />
          <StatTile label="回流率" value={retentionRateText} />
        </View>
        <Text style={styles.hintText}>
          {retentionTopReason && retentionTopReason.reason
            ? `Top 拦截原因：${retentionTopReason.reason}（${retentionTopReason.count}）`
            : '当前无拦截记录。'}
        </Text>
        <Text style={styles.hintText}>
          {retentionLatest && retentionLatest.outcome
            ? `最近结果：${retentionLatest.outcome}${retentionLatest.reasonCode ? ` · ${retentionLatest.reasonCode}` : ''}`
            : '最近结果：暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>账务追溯摘要（24h）</Text>
        <View style={styles.grid}>
          <StatTile label="支付" value={merchantState.traceSummary.last24h.payments} />
          <StatTile label="账本" value={merchantState.traceSummary.last24h.ledgerRows} />
          <StatTile label="发票" value={merchantState.traceSummary.last24h.invoices} />
        </View>
        <View style={styles.grid}>
          <StatTile label="审计" value={merchantState.traceSummary.last24h.audits} />
          <StatTile label="决策" value={merchantState.traceSummary.last24h.policyDecisions} />
          <StatTile label="待补链" value={merchantState.traceSummary.last24h.tracePendingPayments} />
        </View>
        <Text style={styles.hintText}>
          {latestTrace && latestTrace.paymentTxnId
            ? `最近链路：${latestTrace.paymentTxnId} · ${latestTrace.chainComplete ? '完整' : '待补齐'}`
            : '最近链路：暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <View style={styles.contractHeaderRow}>
          <Text style={styles.sectionTitle}>数据与模型口径</Text>
          <Pressable
            style={styles.contractRefreshBtn}
            onPress={() => {
              void refreshContractVisibility();
            }}
          >
            <Text style={styles.contractRefreshBtnText}>刷新口径</Text>
          </Pressable>
        </View>
        <Text style={styles.hintText}>
          目标指标：{modelContract?.targetMetric || 'MERCHANT_LONG_TERM_VALUE_30D'} · 窗口 {modelContract?.windowDays || 30} 天
        </Text>
        <View style={styles.grid}>
          <StatTile label="数据口径版本" value={dataContract?.version || '-'} />
          <StatTile label="模型口径版本" value={modelContract?.version || '-'} />
        </View>
        <Text style={styles.hintText}>
          核心公式：{modelContract?.effectiveProbabilityFormula || 'upliftProbability * responseProbability * (1 - churnProbability)'}
        </Text>
        <Text style={styles.hintText}>
          数据域数：{dataContract?.domainCount || 0} · 事件数：{dataContract?.eventCount || 0}
        </Text>
        <Text style={styles.hintText}>模型信号：{signalFieldText}</Text>
        {dataContract && dataContract.missingDomains.length > 0 ? (
          <Text style={styles.contractWarnText}>缺失数据域：{dataContract.missingDomains.join(' / ')}</Text>
        ) : null}
        {modelContract && modelContract.missingSignalPolicies.length > 0 ? (
          <Text style={styles.contractWarnText}>
            缺失模型信号策略：{modelContract.missingSignalPolicies.slice(0, 3).join(' / ')}
          </Text>
        ) : null}
        {contractVisibility.errorMessage ? (
          <Text style={styles.contractErrorText}>口径数据暂不可用：{contractVisibility.errorMessage}</Text>
        ) : null}
        {contractVisibility.loading ? (
          <Text style={styles.hintText}>口径刷新中...</Text>
        ) : null}
        <Text style={styles.hintText}>
          最近刷新：{contractVisibility.lastRefreshedAt ? new Date(contractVisibility.lastRefreshedAt).toLocaleString() : '暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>激活策略概要</Text>
        <Text style={styles.subtitle}>快速查看五阶段营销动作的启用和执行情况。</Text>
        <View style={styles.grid}>
          <StatTile label="获客" value={merchantState.acquisitionWelcomeSummary.hitCount24h > 0 ? '运行中' : '待观察'} />
          <StatTile label="激活" value={merchantState.activationRecoverySummary.hitCount24h > 0 ? '运行中' : '待观察'} />
          <StatTile label="活跃" value={merchantState.engagementSummary.hitCount24h > 0 ? '运行中' : '待观察'} />
        </View>
        <View style={styles.grid}>
          <StatTile label="扩收" value={merchantState.revenueUpsellSummary.hitCount24h > 0 ? '运行中' : '待观察'} />
          <StatTile label="留存" value={merchantState.retentionWinbackSummary.hitCount24h > 0 ? '运行中' : '待观察'} />
          <StatTile label="24h执行" value={
            merchantState.acquisitionWelcomeSummary.hitCount24h
            + merchantState.activationRecoverySummary.hitCount24h
            + merchantState.engagementSummary.hitCount24h
            + merchantState.revenueUpsellSummary.hitCount24h
            + merchantState.retentionWinbackSummary.hitCount24h
          } />
        </View>
        <View style={styles.row}>
          <Pressable style={styles.linkBtn} onPress={() => router.push('/(tabs)/marketing')}>
            <Text style={styles.linkBtnText}>前往营销助手</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push('/(tabs)/audit')}>
            <Text style={styles.linkBtnText}>查看审计中心</Text>
          </Pressable>
        </View>
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...mqTheme.typography.body,
    color: '#435571',
  },
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
  },
  storeName: {
    ...mqTheme.typography.body,
    color: mqTheme.colors.ink,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  hintText: {
    ...mqTheme.typography.body,
    color: '#435571',
  },
  linkBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: mqTheme.colors.surfaceAlt,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#203553',
    textAlign: 'center',
  },
  contractHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: mqTheme.spacing.sm,
  },
  contractRefreshBtn: {
    borderWidth: 1,
    borderColor: '#c7d8f3',
    borderRadius: mqTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#edf4ff',
  },
  contractRefreshBtnText: {
    fontSize: 12,
    color: '#264d88',
    fontWeight: '700',
  },
  contractWarnText: {
    ...mqTheme.typography.body,
    color: '#855e1d',
  },
  contractErrorText: {
    ...mqTheme.typography.body,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  experiencePathRow: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  releaseGateRow: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  pathTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#203553',
  },
});
