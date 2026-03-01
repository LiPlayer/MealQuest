import React from 'react';
import { Pressable, StatusBar, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Brain, LayoutDashboard, ScrollText } from 'lucide-react-native';

import { MerchantProvider, useMerchant } from './src/context/MerchantContext';
import HomeScreen from './src/screens/HomeScreen';
import StrategyScreen from './src/screens/StrategyScreen';
import OperationsScreen from './src/screens/OperationsScreen';
import AuditScreen from './src/screens/AuditScreen';
import LoginScreen from './src/screens/LoginScreen';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const { pendingReviewCount, logout } = useMerchant();

  return (
    <Tab.Navigator
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
          if (route.name === 'Home') return <Home size={size} color={color} />;
          if (route.name === 'Strategy') return <Brain size={size} color={color} />;
          if (route.name === 'Operations') return <LayoutDashboard size={size} color={color} />;
          if (route.name === 'Audit') return <ScrollText size={size} color={color} />;
          return null;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen
        name="Strategy"
        component={StrategyScreen}
        options={{
          tabBarBadge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
        }}
      />
      <Tab.Screen name="Operations" component={OperationsScreen} />
      <Tab.Screen name="Audit" component={AuditScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <MerchantProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </MerchantProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { isAuthenticated } = useMerchant();
  if (!isAuthenticated) {
    return <LoginScreen />;
  }
  return <TabNavigator />;
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
