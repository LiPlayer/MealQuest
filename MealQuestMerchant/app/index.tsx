import React from 'react';
import { Redirect } from 'expo-router';

import BootSplash from '../src/components/BootSplash';
import { useMerchant } from '../src/context/MerchantContext';

export default function IndexRoute() {
  const { authHydrating, isAuthenticated, pendingOnboardingSession } = useMerchant();

  if (authHydrating) {
    return <BootSplash />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/strategy" />;
  }

  if (pendingOnboardingSession) {
    return <Redirect href="/quick-onboard" />;
  }

  return <Redirect href="/login" />;
}
