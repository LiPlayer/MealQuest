import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import BootSplash from '../components/BootSplash';
import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
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
  const { authHydrating, isAuthenticated, pendingOnboardingSession, merchantState } = useMerchant();
  const qrRef = useRef<QrCodeHandle | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');

  const merchantId = useMemo(
    () => String(merchantState.merchantId || '').trim(),
    [merchantState.merchantId],
  );
  const merchantName = useMemo(
    () => String(merchantState.merchantName || '').trim() || merchantId || '当前门店',
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
      Alert.alert('已保存', '入店二维码已保存到系统相册。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存二维码失败';
      Alert.alert('保存失败', message);
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
      const message = error instanceof Error ? error.message : '分享二维码失败';
      Alert.alert('分享失败', message);
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
    <AppShell edges={['bottom']}>
      <SurfaceCard style={styles.card}>
        <Text style={styles.pageTitle}>入店收款码</Text>
        <Text style={styles.storeName}>{merchantName}</Text>
        <Text style={styles.storeId}>门店标识：{merchantId || '-'}</Text>
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
            <Text style={styles.errorText}>门店标识不可用，请重新登录后重试。</Text>
          )}
        </View>
        <Text style={styles.hintText}>
          顾客扫码后可直接入店。可将二维码保存到相册或分享给店员打印。
        </Text>
      </SurfaceCard>

      <View style={styles.actions}>
        <ActionButton
          testID="merchant-entry-qr-save"
          label="保存图片"
          onPress={handleSave}
          disabled={!canOperate}
          busy={saving}
          icon="download"
        />
        <ActionButton
          testID="merchant-entry-qr-share"
          label="分享图片"
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
  pageTitle: {
    ...mqTheme.typography.sectionTitle,
    fontSize: 20,
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
