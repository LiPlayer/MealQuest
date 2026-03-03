import React from 'react';
import { StatusBar } from 'react-native';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MerchantProvider } from '../src/context/MerchantContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <MerchantProvider>
        <Slot />
      </MerchantProvider>
    </SafeAreaProvider>
  );
}
