import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BootSplash from '../../src/components/BootSplash';
import { useMerchant } from '../../src/context/MerchantContext';
import { mqTheme } from '../../src/theme/tokens';

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  dashboard: 'grid-outline',
  agent: 'sparkles-outline',
  automation: 'flash-outline',
  notifications: 'notifications-outline',
  approvals: 'checkmark-done-outline',
  replay: 'time-outline',
  risk: 'shield-checkmark-outline',
};

export default function TabsLayout() {
  const { authHydrating, isAuthenticated, pendingOnboardingSession } = useMerchant();
  const insets = useSafeAreaInsets();

  if (authHydrating) {
    return <BootSplash />;
  }

  if (!isAuthenticated) {
    return <Redirect href={pendingOnboardingSession ? '/quick-onboard' : '/login'} />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 56 + Math.max(insets.bottom, 8),
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ],
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: mqTheme.colors.primary,
        tabBarInactiveTintColor: '#7489a6',
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => {
          const icon = iconMap[route.name];
          if (!icon) {
            return null;
          }
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: '看板' }} />
      <Tabs.Screen name="agent" options={{ title: '策略' }} />
      <Tabs.Screen name="automation" options={{ title: '自动化' }} />
      <Tabs.Screen name="notifications" options={{ title: '提醒' }} />
      <Tabs.Screen name="approvals" options={{ title: '审批' }} />
      <Tabs.Screen name="replay" options={{ title: '回放' }} />
      <Tabs.Screen name="risk" options={{ title: '风控' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: mqTheme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: mqTheme.colors.border,
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});
