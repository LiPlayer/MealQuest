import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Brain, LayoutDashboard, ScrollText } from 'lucide-react-native';

import { MerchantApi } from './src/services/merchantApi';
import { MerchantProvider, useMerchant } from './src/context/MerchantContext';
import { SectionCard } from './src/components/SectionCard';

import HomeScreen from './src/screens/HomeScreen';
import StrategyScreen from './src/screens/StrategyScreen';
import OperationsScreen from './src/screens/OperationsScreen';
import AuditScreen from './src/screens/AuditScreen';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const { pendingReviewCount } = useMerchant();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
          // Removed fixed height and padding to allow react-navigation to handle safe area
        },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size }) => {
          if (route.name === '首页') return <Home size={size} color={color} />;
          if (route.name === 'AI策略') return <Brain size={size} color={color} />;
          if (route.name === '运营') return <LayoutDashboard size={size} color={color} />;
          if (route.name === '日志') return <ScrollText size={size} color={color} />;
          return null;
        },
      })}
    >
      <Tab.Screen name="首页" component={HomeScreen} />
      <Tab.Screen
        name="AI策略"
        component={StrategyScreen}
        options={{
          tabBarBadge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' }
        }}
      />
      <Tab.Screen name="运营" component={OperationsScreen} />
      <Tab.Screen name="日志" component={AuditScreen} />
    </Tab.Navigator>
  );
}

function MerchantConsoleApp({
  initialToken,
  initialMerchantState,
  contactPhone,
  onAuthExpired,
}: {
  initialToken: string;
  initialMerchantState?: import('./src/domain/merchantEngine').MerchantState;
  contactPhone: string;
  onAuthExpired: () => void;
}) {
  return (
    <SafeAreaProvider>
      <MerchantProvider
        initialToken={initialToken}
        initialMerchantState={initialMerchantState}
        onAuthExpired={onAuthExpired}
      >
        <NavigationContainer>
          <TabNavigator />
        </NavigationContainer>
      </MerchantProvider>
    </SafeAreaProvider>
  );
}

/**
 * ENTRY FLOW COMPONENT
 */
type MerchantEntryStep = 'PHONE_LOGIN' | 'OPEN_STORE';

function buildMerchantIdFromName(name: string): string {
  const trimmed = String(name || '').trim().toLowerCase();
  if (!trimmed) {
    return `m_store_${Date.now().toString(36).slice(-6)}`;
  }
  const asciiSlug = trimmed
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  if (asciiSlug.length >= 2) {
    return `m_${asciiSlug}`;
  }
  return `m_store_${Date.now().toString(36).slice(-6)}`;
}

function MerchantEntryFlow({
  onComplete,
}: {
  onComplete: (payload: { merchantId: string; token: string; phone: string }) => void;
}) {
  const [step, setStep] = useState<MerchantEntryStep>('PHONE_LOGIN');
  const [contactPhone, setContactPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const suggestedMerchantId = useMemo(
    () => buildMerchantIdFromName(merchantName),
    [merchantName],
  );

  const onRequestPhoneCode = async () => {
    setError('');
    setHint('');
    if (!contactPhone.trim()) {
      setError('Please input phone number');
      return;
    }
    setLoading(true);
    try {
      await MerchantApi.requestMerchantLoginCode(contactPhone.trim());
      setHint('Code sent, please check SMS');
    } catch (err: any) {
      setError(err?.message || 'Failed to request code');
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPhoneLogin = async () => {
    setError('');
    setHint('');
    if (!contactPhone.trim()) { setError('Phone is required'); return; }
    if (!phoneCode.trim()) { setError('Phone verification code is required'); return; }
    setLoading(true);
    try {
      const result = await MerchantApi.loginByPhone({
        phone: contactPhone.trim(),
        code: phoneCode.trim(),
      });
      setToken(result.token);
      if (result.profile.merchantId) {
        MerchantApi.setMerchantId(result.profile.merchantId);
        onComplete({ merchantId: result.profile.merchantId, token: result.token, phone: result.profile.phone || contactPhone.trim() });
        return;
      }
      setStep('OPEN_STORE');
      setHint("Phone login verified. No store is bound yet, let's quick open one.");
    } catch (err: any) {
      setError(err?.message || 'Phone login failed');
    } finally {
      setLoading(false);
    }
  };

  const onOpenStore = async () => {
    setError('');
    if (!merchantName.trim()) { setError('Please enter a store name'); return; }
    setLoading(true);
    try {
      const generatedMerchantId = buildMerchantIdFromName(merchantName);
      const result = await MerchantApi.onboardMerchant({
        merchantId: generatedMerchantId,
        name: merchantName.trim(),
        ownerPhone: contactPhone,
      });
      const nextMerchantId = result.merchant.merchantId;
      MerchantApi.setMerchantId(nextMerchantId);
      onComplete({ merchantId: nextMerchantId, token, phone: contactPhone });
    } catch (err: any) {
      setError(err?.message || 'Store onboarding failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.entryContainer}>
          <View style={styles.entryHero}>
            <Text style={styles.entryHeroKicker}>MealQuest Merchant</Text>
            <Text style={styles.entryTitle}>Merchant Onboarding</Text>
            <Text style={styles.entrySubtitle}>
              No preloaded store. Complete phone login, create store, and submit contract.
            </Text>
          </View>

          {step === 'PHONE_LOGIN' && (
            <SectionCard title="1. Phone Login">
              <TextInput
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="Phone number"
                style={styles.entryInput}
                keyboardType="phone-pad"
              />
              <TextInput
                value={phoneCode}
                onChangeText={setPhoneCode}
                placeholder="Phone verification code"
                style={styles.entryInput}
                keyboardType="number-pad"
              />
              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={onRequestPhoneCode}>
                  <Text style={styles.secondaryButtonText}>Send Code</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={onVerifyPhoneLogin}>
                  <Text style={styles.primaryButtonText}>Login and Continue</Text>
                </Pressable>
              </View>
            </SectionCard>
          )}

          {step === 'OPEN_STORE' && (
            <SectionCard title="2. 秒开店 Quick Open Store">
              <TextInput
                value={merchantName}
                onChangeText={setMerchantName}
                placeholder="Store Name"
                style={styles.entryInput}
              />
              <Text style={styles.mutedText}>Auto generated store ID: {suggestedMerchantId}</Text>
              <Pressable style={styles.primaryButton} onPress={onOpenStore}>
                <Text style={styles.primaryButtonText}>Create Store</Text>
              </Pressable>
            </SectionCard>
          )}

          {hint ? <Text style={styles.entryHint}>{hint}</Text> : null}
          {error ? <Text style={styles.entryError}>{error}</Text> : null}
          {loading ? <Text style={styles.entryLoading}>Processing...</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/**
 * BOOTSTRAP HELPERS
 */
const ENTRY_DONE_KEY = 'mq_merchant_entry_done';
const ENTRY_MERCHANT_ID_KEY = 'mq_merchant_entry_merchant_id';
const ENTRY_AUTH_TOKEN_KEY = 'mq_merchant_entry_auth_token';
const ENTRY_AUTH_PHONE_KEY = 'mq_merchant_entry_auth_phone';

type SimpleStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const getSimpleStorage = (): SimpleStorage | null => {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    return (mod?.default || mod) as SimpleStorage;
  } catch {
    return null;
  }
};

const restoreEntryState = async () => {
  const storage = getSimpleStorage();
  if (!storage) return { done: false, merchantId: null, authToken: null, authPhone: null };
  const [doneRaw, merchantId, authToken, authPhone] = await Promise.all([
    storage.getItem(ENTRY_DONE_KEY),
    storage.getItem(ENTRY_MERCHANT_ID_KEY),
    storage.getItem(ENTRY_AUTH_TOKEN_KEY),
    storage.getItem(ENTRY_AUTH_PHONE_KEY),
  ]);
  return {
    done: doneRaw === '1',
    merchantId: merchantId ? String(merchantId) : null,
    authToken: authToken ? String(authToken) : null,
    authPhone: authPhone ? String(authPhone) : null,
  };
};

const persistEntryState = async (merchantId: string, authToken: string, authPhone: string) => {
  const storage = getSimpleStorage();
  if (!storage) return;
  await Promise.all([
    storage.setItem(ENTRY_DONE_KEY, '1'),
    storage.setItem(ENTRY_MERCHANT_ID_KEY, merchantId),
    storage.setItem(ENTRY_AUTH_TOKEN_KEY, authToken),
    storage.setItem(ENTRY_AUTH_PHONE_KEY, authPhone),
  ]);
};

const clearEntryState = async () => {
  const storage = getSimpleStorage();
  if (!storage) return;
  await Promise.all([
    storage.setItem(ENTRY_DONE_KEY, '0'),
    storage.setItem(ENTRY_MERCHANT_ID_KEY, ''),
    storage.setItem(ENTRY_AUTH_TOKEN_KEY, ''),
    storage.setItem(ENTRY_AUTH_PHONE_KEY, ''),
  ]);
};

const isTokenExpiredError = (err: any) => {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('token') && (msg.includes('expired') || msg.includes('invalid'));
};

/**
 * ROOT APP COMPONENT
 */
export default function App() {
  const [entryBootstrapped, setEntryBootstrapped] = useState(false);
  const [ready, setReady] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [merchantId, setMerchantId] = useState(MerchantApi.getMerchantId() || '');
  const [bootstrappedMerchantState, setBootstrappedMerchantState] = useState<any>(undefined);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const state = await restoreEntryState();
        if (!active) return;
        if (state.merchantId) {
          MerchantApi.setMerchantId(state.merchantId);
          setMerchantId(state.merchantId);
        }
        if (state.authPhone) setAuthPhone(state.authPhone);
        if (state.done && state.merchantId && state.authToken) {
          try {
            const validatedState = await MerchantApi.getState(state.authToken, state.merchantId);
            if (active) {
              setBootstrappedMerchantState(validatedState);
              setAuthToken(state.authToken);
              setReady(true);
            }
          } catch (err) {
            if (isTokenExpiredError(err)) {
              await clearEntryState();
              MerchantApi.setMerchantId('');
              if (active) {
                setMerchantId('');
                setAuthToken('');
                setAuthPhone('');
                setReady(false);
              }
            } else {
              if (active) {
                setAuthToken(state.authToken);
                setReady(true);
              }
            }
          }
        }
      } catch { /* skip */ } finally {
        if (active) setEntryBootstrapped(true);
      }
    };
    bootstrap();
    return () => { active = false; };
  }, []);

  if (!entryBootstrapped) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.entryContainerCentered}>
            <Text style={styles.mutedText}>加载中...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!ready) {
    return (
      <MerchantEntryFlow
        onComplete={({ merchantId: nextMerchantId, token: nextToken, phone: nextPhone }) => {
          MerchantApi.setMerchantId(nextMerchantId);
          setMerchantId(nextMerchantId);
          setAuthToken(nextToken);
          setAuthPhone(nextPhone);
          persistEntryState(nextMerchantId, nextToken, nextPhone).catch(() => { });
          setReady(true);
        }}
      />
    );
  }

  return (
    <MerchantConsoleApp
      key={`merchant-console-${merchantId}`}
      initialToken={authToken}
      initialMerchantState={bootstrappedMerchantState}
      contactPhone={authPhone}
      onAuthExpired={() => {
        MerchantApi.setMerchantId('');
        setMerchantId('');
        setAuthToken('');
        setAuthPhone('');
        setBootstrappedMerchantState(undefined);
        clearEntryState().catch(() => { });
        setReady(false);
      }}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eaf0f8',
  },
  entryContainerFixed: {
    flex: 1,
  },
  entryContainer: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    gap: 20,
  },
  entryContainerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryHero: {
    marginBottom: 10,
  },
  entryHeroKicker: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  entryTitle: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 12,
  },
  entrySubtitle: {
    color: '#64748b',
    fontSize: 15,
    lineHeight: 22,
  },
  entryInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontSize: 15,
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  entryHint: {
    color: '#059669',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  entryError: {
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  entryLoading: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  mutedText: {
    color: '#94a3b8',
    fontSize: 14,
  },
});
