import React, { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import AppShell from '../components/ui/AppShell';
import ActionButton from '../components/ui/ActionButton';
import SurfaceCard from '../components/ui/SurfaceCard';
import { mqTheme } from '../theme/tokens';

type QuickOnboardScreenProps = {
  ownerPhone: string;
  submitting?: boolean;
  onBack: () => void;
  onSubmit: (params: { name: string }) => Promise<void>;
};

export default function QuickOnboardScreen(props: QuickOnboardScreenProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const phone = String(props.ownerPhone || '').trim();

  const handleCreate = async () => {
    const ownerPhone = String(phone || '').trim();
    const merchantName = String(name || '').trim();
    if (!ownerPhone || !merchantName) {
      setError('请填写门店名称后再继续。');
      return;
    }
    setError('');
    try {
      await props.onSubmit({
        name: merchantName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '开店初始化失败');
    }
  };

  return (
    <AppShell contentContainerStyle={styles.shellContent}>
      <SurfaceCard style={styles.card}>
        <Text style={styles.title}>快速开店</Text>
        <Text style={styles.subtitle}>首次登录仅需填写门店名称，1 步完成初始化。</Text>

        <TextInput
          testID="quick-onboard-phone-input"
          style={styles.input}
          placeholder="老板手机号"
          placeholderTextColor="#7f90a6"
          value={phone}
          autoCapitalize="none"
          editable={false}
        />
        <TextInput
          testID="quick-onboard-name-input"
          style={styles.input}
          placeholder="请输入门店名称"
          placeholderTextColor="#7f90a6"
          value={name}
          onChangeText={setName}
        />

        <ActionButton
          testID="quick-onboard-submit-btn"
          label={props.submitting ? '创建中...' : '创建门店'}
          busy={Boolean(props.submitting)}
          onPress={handleCreate}
          disabled={Boolean(props.submitting)}
          icon="storefront"
        />

        <ActionButton
          testID="quick-onboard-back-btn"
          label="返回登录"
          onPress={props.onBack}
          disabled={Boolean(props.submitting)}
          variant="secondary"
          icon="chevron-left"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    justifyContent: 'center',
    paddingTop: 36,
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
  errorText: {
    color: mqTheme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
});
