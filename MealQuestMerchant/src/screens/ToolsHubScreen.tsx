import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import { mqTheme } from '../theme/tokens';

type ToolItem = {
  title: string;
  description: string;
  route: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const TOOL_ITEMS: ToolItem[] = [
  {
    title: '完整经营看板',
    description: '查看完整指标、发布建议和经营趋势。',
    route: '/(tabs)/dashboard',
    icon: 'dashboard',
  },
  {
    title: '策略助手',
    description: '通过对话生成策略提案并做决策。',
    route: '/(tabs)/agent',
    icon: 'auto-awesome',
  },
  {
    title: '审批中心',
    description: '统一处理待审批事项与发布状态。',
    route: '/(tabs)/approvals',
    icon: 'fact-check',
  },
  {
    title: '执行回放',
    description: '回看策略执行结果和原因。',
    route: '/(tabs)/replay',
    icon: 'history',
  },
  {
    title: '风险与实验',
    description: '管理风险边界、实验状态和回滚。',
    route: '/(tabs)/risk',
    icon: 'shield',
  },
  {
    title: '自动化运营',
    description: '查看自动化开关、规则和执行日志。',
    route: '/(tabs)/automation',
    icon: 'bolt',
  },
  {
    title: '提醒中心',
    description: '查看待办提醒、执行结果与反馈消息。',
    route: '/(tabs)/notifications',
    icon: 'notifications',
  },
];

export default function ToolsHubScreen() {
  const router = useRouter();

  return (
    <AppShell scroll>
      <SurfaceCard>
        <Text style={styles.title}>高级工具</Text>
        <Text style={styles.subtitle}>
          这里汇总了所有高级能力。日常经营建议先在首页完成，遇到复杂问题再进入这里。
        </Text>
      </SurfaceCard>

      <SurfaceCard style={styles.listCard}>
        {TOOL_ITEMS.map((item) => (
          <Pressable
            key={item.route}
            onPress={() => router.push(item.route)}
            style={({ pressed }) => [styles.toolItem, pressed ? styles.toolItemPressed : null]}
            testID={`tools-nav-${item.route.replace(/[^\w]/g, '-')}`}
          >
            <View style={styles.iconWrap}>
              <MaterialIcons name={item.icon} size={20} color={mqTheme.colors.primary} />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDesc}>{item.description}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={mqTheme.colors.inkMuted} />
          </Pressable>
        ))}
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  title: {
    ...mqTheme.typography.sectionTitle,
    fontSize: 22,
  },
  subtitle: {
    ...mqTheme.typography.body,
    color: '#334a69',
  },
  listCard: {
    paddingVertical: 8,
  },
  toolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: mqTheme.colors.border,
  },
  toolItemPressed: {
    opacity: 0.75,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mqTheme.colors.surfaceAlt,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: mqTheme.colors.ink,
  },
  itemDesc: {
    ...mqTheme.typography.caption,
    color: '#3f5574',
  },
});
