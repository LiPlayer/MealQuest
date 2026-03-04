import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import BootSplash from '../components/BootSplash';
import { useMerchant } from '../context/MerchantContext';
import {
  saveEntryQrToLibrary,
  shareEntryQrImage,
  writeEntryQrPngFile,
} from '../services/entryQrService';

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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={18} color="#0f172a" />
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Store Entry QR</Text>
      </View>

      <View style={styles.card}>
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
          Print or share this QR code for customers to scan and enter your store.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          testID="merchant-entry-qr-save"
          disabled={!canOperate}
          onPress={handleSave}
          style={[styles.actionBtn, !canOperate && styles.actionBtnDisabled]}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <MaterialIcons name="download" size={16} color="#ffffff" />
              <Text style={styles.actionBtnText}>Save Image</Text>
            </>
          )}
        </Pressable>
        <Pressable
          testID="merchant-entry-qr-share"
          disabled={!canOperate}
          onPress={handleShare}
          style={[styles.actionBtn, !canOperate && styles.actionBtnDisabled]}
        >
          {sharing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <MaterialIcons name="share" size={16} color="#ffffff" />
              <Text style={styles.actionBtnText}>Share Image</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  header: {
    gap: 8,
  },
  backBtn: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    alignItems: 'center',
    gap: 10,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  storeId: {
    fontSize: 12,
    color: '#475569',
  },
  qrWrap: {
    width: '100%',
    flex: 1,
    minHeight: 260,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  hintText: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
