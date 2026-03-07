import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import AppShell from '../components/ui/AppShell';
import ActionButton from '../components/ui/ActionButton';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import { mqTheme } from '../theme/tokens';

export default function LoginScreen() {
  const { authSubmitting, authError, requestLoginCode, loginWithPhone } = useMerchant();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');

  const handleRequestCode = async () => {
    setLocalError('');
    try {
      await requestLoginCode(phone);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '验证码发送失败');
    }
  };

  const handleLogin = async () => {
    setLocalError('');
    try {
      await loginWithPhone({ phone, code });
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败';
      setLocalError(message);
    }
  };

  const mergedError = localError || authError;

  return (
    <AppShell contentContainerStyle={styles.shellContent}>
      <SurfaceCard style={styles.card}>
        <Text style={styles.title}>老板端登录</Text>
        <Text style={styles.subtitle}>输入手机号和验证码，即可进入今日经营首页。</Text>

        <TextInput
          testID="login-phone-input"
          style={styles.input}
          placeholder="手机号，例如 13900000001"
          placeholderTextColor="#7f90a6"
          value={phone}
          onChangeText={setPhone}
          autoCapitalize="none"
        />

        <View style={styles.row}>
          <TextInput
            testID="login-code-input"
            style={[styles.input, styles.codeInput]}
            placeholder="6位验证码"
            placeholderTextColor="#7f90a6"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
          />
          <View style={styles.requestBtnWrap}>
            <ActionButton
              testID="login-request-code-btn"
              label={authSubmitting ? '发送中...' : '发送验证码'}
              onPress={handleRequestCode}
              disabled={authSubmitting}
              variant="secondary"
            />
          </View>
        </View>

        <ActionButton
          testID="login-submit-btn"
          label={authSubmitting ? '登录中...' : '登录'}
          onPress={handleLogin}
          disabled={authSubmitting}
          icon="login"
        />

        {authSubmitting ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={mqTheme.colors.primary} size="small" />
            <Text style={styles.loadingText}>正在校验登录状态...</Text>
          </View>
        ) : null}

        {mergedError ? <Text style={styles.errorText}>{mergedError}</Text> : null}
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    justifyContent: 'center',
    paddingTop: 44,
  },
  card: {
    borderRadius: mqTheme.radius.xl,
    padding: mqTheme.spacing.xl,
    gap: mqTheme.spacing.md,
    ...mqTheme.shadow.floating,
  },
  title: {
    ...mqTheme.typography.title,
  },
  subtitle: {
    ...mqTheme.typography.body,
    color: '#40516b',
  },
  row: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: mqTheme.colors.ink,
    backgroundColor: mqTheme.colors.surfaceAlt,
  },
  codeInput: {
    flex: 1,
  },
  requestBtnWrap: {
    width: 136,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    ...mqTheme.typography.caption,
    color: mqTheme.colors.inkMuted,
  },
  errorText: {
    color: mqTheme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
});
