import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import StatTile from '../components/ui/StatTile';
import { useMerchant } from '../context/MerchantContext';
import { mqTheme } from '../theme/tokens';

export default function DashboardScreen() {
  const router = useRouter();
  const { merchantState, refreshContractVisibility } = useMerchant();
  const welcomeTopReason = merchantState.acquisitionWelcomeSummary.topBlockedReasons[0];
  const welcomeLatest = merchantState.acquisitionWelcomeSummary.latestResults[0];
  const activationTopReason = merchantState.activationRecoverySummary.topBlockedReasons[0];
  const activationLatest = merchantState.activationRecoverySummary.latestResults[0];
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

  return (
    <AppShell>
      <View style={styles.header}>
        <Text style={styles.title}>经营看板（基线）</Text>
        <Text style={styles.subtitle}>围绕长期价值最大化，持续追踪商户收益与 Uplift 变化。</Text>
      </View>

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
        <Text style={styles.sectionTitle}>导航预留</Text>
        <Text style={styles.subtitle}>审批、回放、风控页已提前建好入口，减少后续频繁改版。</Text>
        <View style={styles.row}>
          <Pressable style={styles.linkBtn} onPress={() => router.push('/(tabs)/agent')}>
            <Text style={styles.linkBtnText}>进入 Agent</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push('/entry-qrcode')}>
            <Text style={styles.linkBtnText}>门店 Entry QR</Text>
          </Pressable>
        </View>
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  header: {
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
});
