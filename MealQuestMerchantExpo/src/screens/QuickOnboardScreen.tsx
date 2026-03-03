import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      setError('phone and store name are required');
      return;
    }
    setError('');
    try {
      await props.onSubmit({
        name: merchantName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'onboarding failed');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <Text style={styles.title}>Quick Onboard</Text>
        <Text style={styles.subtitle}>Create your first merchant store in one step.</Text>
        <TextInput
          testID="quick-onboard-phone-input"
          style={styles.input}
          placeholder="Owner phone, e.g. +8613900000001"
          value={phone}
          autoCapitalize="none"
          editable={false}
        />
        <TextInput
          testID="quick-onboard-name-input"
          style={styles.input}
          placeholder="Store name"
          value={name}
          onChangeText={setName}
        />
        <Pressable
          testID="quick-onboard-submit-btn"
          style={[styles.btn, styles.primaryBtn, props.submitting && styles.disabledBtn]}
          onPress={handleCreate}
          disabled={props.submitting}
        >
          {props.submitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Create Store</Text>
          )}
        </Pressable>
        <Pressable testID="quick-onboard-back-btn" style={[styles.btn, styles.backBtn]} onPress={props.onBack}>
          <Text style={styles.backBtnText}>Back to Login</Text>
        </Pressable>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  backBtn: {
    backgroundColor: '#e2e8f0',
  },
  backBtnText: {
    color: '#0f172a',
    fontWeight: '700',
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
