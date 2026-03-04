import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import BootSplash from '../../src/components/BootSplash';
import { useMerchant } from '../../src/context/MerchantContext';
import { mqTheme } from '../../src/theme/tokens';

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  dashboard: 'grid-outline',
  agent: 'sparkles-outline',
  approvals: 'checkmark-done-outline',
  replay: 'time-outline',
  risk: 'shield-checkmark-outline',
};

const titleMap: Record<string, string> = {
  dashboard: 'Dashboard',
  agent: 'Agent',
  approvals: 'Approvals',
  replay: 'Replay',
  risk: 'Risk',
};

export default function TabsLayout() {
  const { authHydrating, isAuthenticated, pendingOnboardingSession, logout } = useMerchant();

  if (authHydrating) {
    return <BootSplash />;
  }

  if (!isAuthenticated) {
    return <Redirect href={pendingOnboardingSession ? '/quick-onboard' : '/login'} />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: true,
        headerTitle: titleMap[route.name] || 'MealQuest',
        headerStyle: {
          backgroundColor: mqTheme.colors.surface,
        },
        headerTitleStyle: {
          color: mqTheme.colors.ink,
          fontSize: 16,
          fontWeight: '800',
        },
        headerShadowVisible: false,
        headerRight: () => (
          <Pressable style={styles.logoutBtn} onPress={logout}>
            <MaterialIcons name="logout" size={14} color="#223654" />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        ),
        tabBarStyle: styles.tabBar,
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
      <Tabs.Screen name="agent" options={{ title: 'Agent' }} />
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
    height: 64,
    paddingTop: 4,
    paddingBottom: 7,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  logoutBtn: {
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: mqTheme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#223654',
  },
});
