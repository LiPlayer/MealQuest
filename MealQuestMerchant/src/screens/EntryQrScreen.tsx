import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import BootSplash from '../components/BootSplash';
import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import TopBar from '../components/ui/TopBar';
import { useMerchant } from '../context/MerchantContext';
import {
  saveEntryQrToLibrary,
  shareEntryQrImage,
  writeEntryQrPngFile,
} from '../services/entryQrService';
import { mqTheme } from '../theme/tokens';

type ActionState = 'idle' | 'saving' | 'sharing';
type QrCodeHandle = {
  toDataURL?: (callback: (value: string) => void) => void;
};

function toQrBase64(qrRef: QrCodeHandle | null): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!qrRef || typeof qrRef.toDataURL !== 'function') {
      reject(new Error('QR renderer is not ready'));
      return;
    }
    qrRef.toDataURL((value: string) => {
      const normalized = String(value || '').trim();
      if (!normalized) {
        reject(new Error('failed to read QR image'));
        return;
      }
      resolve(normalized);
    });
  });
}

export default function EntryQrScreen() {
  const router = useRouter();
  const { authHydrating, isAuthenticated, pendingOnboardingSession, merchantState } = useMerchant();
  const qrRef = useRef<QrCodeHandle | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');

  const merchantId = useMemo(
    () => String(merchantState.merchantId || '').trim(),
    [merchantState.merchantId],
  );
  const merchantName = useMemo(
    () => String(merchantState.merchantName || '').trim() || merchantId || 'Current Store',
    [merchantState.merchantName, merchantId],
  );

  const handleBack = useCallback(() => {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/dashboard');
  }, [router]);

  const buildQrImageFile = useCallback(async (): Promise<string> => {
    if (!merchantId) {
      throw new Error('merchantId is unavailable');
    }
    const base64Png = await toQrBase64(qrRef.current);
    return writeEntryQrPngFile({
      merchantId,
      base64Png,
    });
  }, [merchantId]);

  const handleSave = useCallback(async () => {
    try {
      setActionState('saving');
      const fileUri = await buildQrImageFile();
      await saveEntryQrToLibrary(fileUri);
      Alert.alert('Saved', 'Entry QR image has been saved to your gallery.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to save entry QR image';
      Alert.alert('Save failed', message);
    } finally {
      setActionState('idle');
    }
  }, [buildQrImageFile]);

  const handleShare = useCallback(async () => {
    try {
      setActionState('sharing');
      const fileUri = await buildQrImageFile();
      await shareEntryQrImage(fileUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to share entry QR image';
      Alert.alert('Share failed', message);
    } finally {
      setActionState('idle');
    }
  }, [buildQrImageFile]);

  if (authHydrating) {
    return <BootSplash />;
  }

  if (!isAuthenticated) {
    return <Redirect href={pendingOnboardingSession ? '/quick-onboard' : '/login'} />;
  }

  const saving = actionState === 'saving';
  const sharing = actionState === 'sharing';
  const busy = saving || sharing;
  const canOperate = !busy && Boolean(merchantId);

  return (
    <AppShell>
      <TopBar
        title="Store Entry QR"
        subtitle="固定门店二维码，用于顾客扫码入店"
        onBack={handleBack}
      />

      <SurfaceCard style={styles.card}>
        <Text style={styles.storeName}>{merchantName}</Text>
        <Text style={styles.storeId}>merchantId: {merchantId || '-'}</Text>
        <View style={styles.qrWrap}>
          {merchantId ? (
            <QRCode
              value={merchantId}
              size={220}
              getRef={(instance: QRCode | null) => {
                qrRef.current = instance as unknown as QrCodeHandle | null;
              }}
            />
          ) : (
            <Text style={styles.errorText}>merchantId is unavailable. Please re-login.</Text>
          )}
        </View>
        <Text style={styles.hintText}>
          Print, save, or share this QR code for customers to scan and enter your store.
        </Text>
      </SurfaceCard>

      <View style={styles.actions}>
        <ActionButton
          testID="merchant-entry-qr-save"
          label="Save Image"
          onPress={handleSave}
          disabled={!canOperate}
          busy={saving}
          icon="download"
        />
        <ActionButton
          testID="merchant-entry-qr-share"
          label="Share Image"
          onPress={handleShare}
          disabled={!canOperate}
          busy={sharing}
          icon="share"
          variant="secondary"
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: mqTheme.spacing.lg,
  },
  storeName: {
    fontSize: 17,
    fontWeight: '800',
    color: mqTheme.colors.ink,
  },
  storeId: {
    ...mqTheme.typography.caption,
  },
  qrWrap: {
    width: '100%',
    flex: 1,
    minHeight: 260,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.lg,
    backgroundColor: mqTheme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  hintText: {
    ...mqTheme.typography.caption,
    textAlign: 'center',
    color: '#394d68',
  },
  errorText: {
    fontSize: 13,
    color: mqTheme.colors.danger,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
    marginBottom: mqTheme.spacing.sm,
  },
});
