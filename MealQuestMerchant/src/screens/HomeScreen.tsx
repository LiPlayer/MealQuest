import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import StatTile from '../components/ui/StatTile';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import { mqTheme } from '../theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const { merchantState, onTriggerProactiveScan, authSession } = useMerchant();
  const [runningSuggestion, setRunningSuggestion] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const merchantName = String(merchantState.merchantName || '').trim() || '当前门店';
  const budgetUsagePercent = useMemo(() => {
    const cap = Number(merchantState.budgetCap) || 0;
    const used = Number(merchantState.budgetUsed) || 0;
    if (cap <= 0) {
      return '-';
    }
    return `${Math.min(100, Math.max(0, (used / cap) * 100)).toFixed(1)}%`;
  }, [merchantState.budgetCap, merchantState.budgetUsed]);
  const strategyExecutionCount24h =
    merchantState.acquisitionWelcomeSummary.hitCount24h
    + merchantState.activationRecoverySummary.hitCount24h
    + merchantState.engagementSummary.hitCount24h
    + merchantState.revenueUpsellSummary.hitCount24h
    + merchantState.retentionWinbackSummary.hitCount24h;

  const highLevelWarning = useMemo(() => {
    if (merchantState.killSwitchEnabled) {
      return '当前已开启紧急停机，营销动作不会自动执行。';
    }
    const blocked =
      merchantState.acquisitionWelcomeSummary.blockedCount24h
      + merchantState.activationRecoverySummary.blockedCount24h
      + merchantState.engagementSummary.blockedCount24h
      + merchantState.revenueUpsellSummary.blockedCount24h
      + merchantState.retentionWinbackSummary.blockedCount24h;
    if (blocked > 0) {
      return `今天有 ${blocked} 次动作被保护规则拦截，建议稍后查看高级工具。`;
    }
    return '当前经营状态稳定，可按建议继续推进。';
  }, [merchantState]);

  const runSuggestedPlan = async () => {
    setActionError('');
    setActionNotice('');
    setRunningSuggestion(true);
    try {
      await onTriggerProactiveScan();
      setActionNotice('已启动今日经营建议，系统将按默认参数执行并记录结果。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '启动建议失败，请稍后重试。';
      setActionError(message);
    } finally {
      setRunningSuggestion(false);
    }
  };

  const handleStartSuggestion = () => {
    Alert.alert(
      '启动今日建议',
      '系统将按默认参数执行建议动作，仍会遵守预算与风险边界。是否继续？',
      [
        { text: '取消', style: 'cancel' },
        { text: '继续', onPress: () => void runSuggestedPlan() },
      ],
    );
  };

  return (
    <AppShell scroll edges={['bottom']}>
      <SurfaceCard style={styles.heroCard}>
        <Text style={styles.heroTitle}>今天要做什么</Text>
        <Text style={styles.heroSubtitle}>{merchantName}，按下面 3 步完成今日经营。</Text>
        <View style={styles.stepWrap}>
          <Text style={styles.stepText}>1. 先处理待办事项</Text>
          <Text style={styles.stepText}>2. 一键启动今日建议</Text>
          <Text style={styles.stepText}>3. 查看今日执行结果</Text>
        </View>
        <Text style={styles.hintText}>{highLevelWarning}</Text>
        {actionNotice ? <Text style={styles.noticeText}>{actionNotice}</Text> : null}
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>一步一步操作</Text>
        <View style={styles.actionGroup}>
          <ActionButton
            label="处理待办事项"
            icon="fact-check"
            onPress={() => router.push('/(tabs)/approvals')}
            testID="home-go-approvals"
          />
          <ActionButton
            label={runningSuggestion ? '启动中...' : '一键启动今日建议'}
            icon={runningSuggestion ? 'hourglass-top' : 'play-arrow'}
            onPress={handleStartSuggestion}
            busy={runningSuggestion}
            disabled={runningSuggestion}
            testID="home-run-suggestion"
          />
          <ActionButton
            label="查看今日执行结果"
            icon="insights"
            onPress={() => router.push('/(tabs)/replay')}
            variant="secondary"
            testID="home-go-replay"
          />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>今日经营概览</Text>
        <View style={styles.statsGrid}>
          <StatTile label="今日新增顾客" value={merchantState.customerEntry.newCustomersToday} />
          <StatTile label="今日入店" value={merchantState.customerEntry.checkinsToday} />
          <StatTile label="今日支付" value={merchantState.traceSummary.last24h.payments} />
          <StatTile label="今日执行动作" value={strategyExecutionCount24h} />
          <StatTile label="预算使用率" value={budgetUsagePercent} />
          <StatTile label="风险保护" value={merchantState.killSwitchEnabled ? '已开启' : '正常'} />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>找不到功能？</Text>
        <Text style={styles.hintText}>
          所有高级能力（完整看板、策略、审批、风控、自动化、提醒）都在“高级工具”里。
        </Text>
        <ActionButton
          label="打开高级工具"
          icon="build-circle"
          variant="secondary"
          onPress={() => router.push('/(tabs)/tools')}
          testID="home-go-tools"
        />
        <Text style={styles.metaText}>
          当前角色：{String(authSession?.role || '-').trim() || '-'}
        </Text>
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: mqTheme.spacing.sm,
  },
  heroTitle: {
    ...mqTheme.typography.sectionTitle,
    fontSize: 24,
  },
  heroSubtitle: {
    ...mqTheme.typography.body,
    color: '#2d425f',
  },
  stepWrap: {
    gap: 4,
  },
  stepText: {
    fontSize: 14,
    fontWeight: '600',
    color: mqTheme.colors.ink,
  },
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
    fontSize: 18,
    marginBottom: 8,
  },
  hintText: {
    ...mqTheme.typography.caption,
    color: '#39506f',
  },
  noticeText: {
    ...mqTheme.typography.caption,
    color: '#146c2e',
    fontWeight: '700',
  },
  errorText: {
    ...mqTheme.typography.caption,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  actionGroup: {
    gap: mqTheme.spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: mqTheme.spacing.sm,
  },
  metaText: {
    ...mqTheme.typography.caption,
  },
});
