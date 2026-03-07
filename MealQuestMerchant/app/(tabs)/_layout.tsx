import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BootSplash from '../../src/components/BootSplash';
import { useMerchant } from '../../src/context/MerchantContext';
import useNotificationDots from '../../src/hooks/useNotificationDots';
import { mqTheme } from '../../src/theme/tokens';

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  dashboard: 'stats-chart-outline',
  marketing: 'sparkles-outline',
  cashier: 'qr-code-outline',
  audit: 'document-text-outline',
  risk: 'shield-checkmark-outline',
};

export default function TabsLayout() {
  const { authHydrating, isAuthenticated, pendingOnboardingSession, authSession } = useMerchant();
  const insets = useSafeAreaInsets();
  const { dots } = useNotificationDots(authSession);

  if (authHydrating) {
    return <BootSplash />;
  }

  if (!isAuthenticated) {
    return <Redirect href={pendingOnboardingSession ? '/quick-onboard' : '/login'} />;
  }

  const withDot = (unreadCount: number) => (
    unreadCount > 0
      ? {
          tabBarBadge: ' ',
          tabBarBadgeStyle: styles.dotBadge,
        }
      : {}
  );

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
      <Tabs.Screen
        name="marketing"
        options={{
          title: '营销',
          ...withDot(dots.marketingUnread),
        }}
      />
      <Tabs.Screen name="cashier" options={{ title: '收银' }} />
      <Tabs.Screen
        name="audit"
        options={{
          title: '审计',
          ...withDot(dots.auditUnread),
        }}
      />
      <Tabs.Screen
        name="risk"
        options={{
          title: '风险',
          ...withDot(dots.riskUnread),
        }}
      />
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
  dotBadge: {
    minWidth: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4d4f',
    color: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: 4,
  },
});
