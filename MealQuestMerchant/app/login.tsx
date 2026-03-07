import React from 'react';
import { Redirect } from 'expo-router';

import BootSplash from '../src/components/BootSplash';
import { useMerchant } from '../src/context/MerchantContext';
import LoginScreen from '../src/screens/LoginScreen';

export default function LoginRoute() {
  const { authHydrating, isAuthenticated, pendingOnboardingSession } = useMerchant();

  if (authHydrating) {
    return <BootSplash />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  if (pendingOnboardingSession) {
    return <Redirect href="/quick-onboard" />;
  }

  return <LoginScreen />;
}
