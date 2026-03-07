import React from 'react';
import { StatusBar } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MerchantProvider } from '../src/context/MerchantContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <MerchantProvider>
        <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="quick-onboard" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </MerchantProvider>
  </SafeAreaProvider>
  );
}
