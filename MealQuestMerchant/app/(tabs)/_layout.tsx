import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BootSplash from '../../src/components/BootSplash';
import { useMerchant } from '../../src/context/MerchantContext';
import { mqTheme } from '../../src/theme/tokens';

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home-outline',
  entry: 'qr-code-outline',
  tools: 'construct-outline',
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
      <Tabs.Screen name="home" options={{ title: '首页' }} />
      <Tabs.Screen name="entry" options={{ title: '收款码' }} />
      <Tabs.Screen name="tools" options={{ title: '高级工具' }} />

      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="agent" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="approvals" options={{ href: null }} />
      <Tabs.Screen name="replay" options={{ href: null }} />
      <Tabs.Screen name="risk" options={{ href: null }} />
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
