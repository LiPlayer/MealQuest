import React from 'react';
import { Redirect, useRouter } from 'expo-router';

import BootSplash from '../src/components/BootSplash';
import { useMerchant } from '../src/context/MerchantContext';
import QuickOnboardScreen from '../src/screens/QuickOnboardScreen';

export default function QuickOnboardRoute() {
  const router = useRouter();
  const {
    authHydrating,
    authSubmitting,
    isAuthenticated,
    pendingOnboardingSession,
    completeOnboarding,
    clearPendingOnboardingSession,
  } = useMerchant();

  if (authHydrating) {
    return <BootSplash />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/home" />;
  }

  if (!pendingOnboardingSession) {
    return <Redirect href="/login" />;
  }

  return (
    <QuickOnboardScreen
      ownerPhone={pendingOnboardingSession.phone}
      submitting={authSubmitting}
      onBack={() => {
        clearPendingOnboardingSession();
        router.replace('/login');
      }}
      onSubmit={({ name }) => completeOnboarding({ name })}
    />
  );
}
