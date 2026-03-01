import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMerchant } from '../context/MerchantContext';

export default function LoginScreen() {
  const { authSubmitting, authError, requestLoginCode, loginWithPhone } = useMerchant();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [merchantId, setMerchantId] = useState('m_store_001');
  const [localError, setLocalError] = useState('');

  const handleRequestCode = async () => {
    setLocalError('');
    try {
      await requestLoginCode(phone);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'request code failed');
    }
  };

  const handleLogin = async () => {
    setLocalError('');
    try {
      await loginWithPhone({ phone, code, merchantId });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'login failed');
    }
  };

  const mergedError = localError || authError;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <Text style={styles.title}>Merchant Login</Text>
        <Text style={styles.subtitle}>Login first to access chat and operations.</Text>

        <TextInput
          testID="login-phone-input"
          style={styles.input}
          placeholder="Phone, e.g. +8613900000001"
          value={phone}
          onChangeText={setPhone}
          autoCapitalize="none"
        />
        <TextInput
          testID="login-merchant-id-input"
          style={styles.input}
          placeholder="Merchant ID, e.g. m_store_001"
          value={merchantId}
          onChangeText={setMerchantId}
          autoCapitalize="none"
        />
        <View style={styles.row}>
          <TextInput
            testID="login-code-input"
            style={[styles.input, styles.codeInput]}
            placeholder="6-digit code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
          />
          <Pressable
            testID="login-request-code-btn"
            style={[styles.btn, styles.secondaryBtn, authSubmitting && styles.disabledBtn]}
            onPress={handleRequestCode}
            disabled={authSubmitting}
          >
            {authSubmitting ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <Text style={styles.secondaryBtnText}>Request Code</Text>
            )}
          </Pressable>
        </View>

        <Pressable
          testID="login-submit-btn"
          style={[styles.btn, styles.primaryBtn, authSubmitting && styles.disabledBtn]}
          onPress={handleLogin}
          disabled={authSubmitting}
        >
          {authSubmitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Login</Text>
          )}
        </Pressable>

        {mergedError ? <Text style={styles.errorText}>{mergedError}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  codeInput: {
    flex: 1,
  },
  btn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: '#0f766e',
  },
  secondaryBtn: {
    backgroundColor: '#e2e8f0',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  secondaryBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
  },
});
