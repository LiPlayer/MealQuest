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
  const { merchantState } = useMerchant();
  const welcomeTopReason = merchantState.acquisitionWelcomeSummary.topBlockedReasons[0];
  const welcomeLatest = merchantState.acquisitionWelcomeSummary.latestResults[0];

  return (
    <AppShell>
      <View style={styles.header}>
        <Text style={styles.title}>经营看板（基线）</Text>
        <Text style={styles.subtitle}>先冻结布局骨架，后续在 S210 完整填充经营指标与趋势。</Text>
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
});
