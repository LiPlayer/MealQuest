import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import BootSplash from '../../src/components/BootSplash';
import { useMerchant } from '../../src/context/MerchantContext';

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
        headerRight: () => (
          <Pressable style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        ),
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'strategy') return <Ionicons name="sparkles-outline" size={size} color={color} />;
          return null;
        },
      })}
    >
      <Tabs.Screen name="strategy" options={{ title: 'Strategy' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  logoutBtn: {
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
});
