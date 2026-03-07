import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';

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

type CashierMode = 'SHOW_QR' | 'SCAN_CODE';
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

export default function CashierScreen() {
  const { merchantState } = useMerchant();
  const [mode, setMode] = useState<CashierMode>('SHOW_QR');
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);
  const [lastScannedValue, setLastScannedValue] = useState('');
  const qrRef = useRef<QrCodeHandle | null>(null);

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
      Alert.alert('已保存', '收银二维码已保存到系统相册。');
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
      const message = error instanceof Error ? error.message : '导出二维码失败';
      Alert.alert('导出失败', message);
    } finally {
      setActionState('idle');
    }
  }, [buildQrImageFile]);

  const handleRequestCamera = useCallback(async () => {
    const result = await requestPermission();
    if (!result?.granted) {
      Alert.alert('需要相机权限', '开启相机权限后，才可使用被扫模式。');
    }
  }, [requestPermission]);

  const handleBarCodeScanned = useCallback((event: { data?: string | null }) => {
    if (scanLocked) {
      return;
    }
    const payload = String(event?.data || '').trim();
    if (!payload) {
      return;
    }
    setScanLocked(true);
    setLastScannedValue(payload);
  }, [scanLocked]);

  const saving = actionState === 'saving';
  const sharing = actionState === 'sharing';
  const busy = saving || sharing;
  const canOperateQr = !busy && Boolean(merchantId);
  const cameraGranted = Boolean(permission?.granted);

  return (
    <AppShell scroll>
      <SurfaceCard>
        <Text style={styles.sectionTitle}>收银台</Text>
        <Text style={styles.metaText}>{merchantName}</Text>
        <Text style={styles.metaText}>门店标识：{merchantId || '-'}</Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>收银模式</Text>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === 'SHOW_QR' ? styles.modeBtnActive : null]}
            onPress={() => setMode('SHOW_QR')}
          >
            <Text style={[styles.modeText, mode === 'SHOW_QR' ? styles.modeTextActive : null]}>顾客扫码</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'SCAN_CODE' ? styles.modeBtnActive : null]}
            onPress={() => setMode('SCAN_CODE')}
          >
            <Text style={[styles.modeText, mode === 'SCAN_CODE' ? styles.modeTextActive : null]}>商家被扫</Text>
          </Pressable>
        </View>
      </SurfaceCard>

      {mode === 'SHOW_QR' ? (
        <SurfaceCard style={styles.qrCard}>
          <Text style={styles.sectionTitle}>顾客扫码收银</Text>
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
          <Text style={styles.metaText}>顾客扫码后可直接进入支付主链路。</Text>
          <View style={styles.actionRow}>
            <ActionButton
              testID="cashier-qr-save"
              label="保存图片"
              onPress={handleSave}
              disabled={!canOperateQr}
              busy={saving}
              icon="download"
            />
            <ActionButton
              testID="cashier-qr-share"
              label="导出打印图"
              onPress={handleShare}
              disabled={!canOperateQr}
              busy={sharing}
              icon="print"
              variant="secondary"
            />
          </View>
        </SurfaceCard>
      ) : (
        <SurfaceCard>
          <Text style={styles.sectionTitle}>商家被扫收银</Text>
          {!cameraGranted ? (
            <>
              <Text style={styles.metaText}>开启相机后可直接扫描顾客付款码。</Text>
              <ActionButton
                label="开启相机权限"
                icon="videocam"
                onPress={() => {
                  void handleRequestCamera();
                }}
              />
            </>
          ) : (
            <>
              <View style={styles.cameraWrap}>
                <CameraView
                  facing="back"
                  style={styles.cameraView}
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
                  }}
                  onBarcodeScanned={handleBarCodeScanned}
                />
              </View>
              <Text style={styles.metaText}>
                {lastScannedValue
                  ? `最近识别：${lastScannedValue}`
                  : '将付款码放入取景框即可自动识别。'}
              </Text>
              <View style={styles.actionRow}>
                <ActionButton
                  label={scanLocked ? '继续扫码' : '等待扫码中'}
                  icon={scanLocked ? 'refresh' : 'camera-alt'}
                  variant="secondary"
                  onPress={() => {
                    setScanLocked(false);
                  }}
                />
              </View>
            </>
          )}
        </SurfaceCard>
      )}

      <SurfaceCard>
        <Text style={styles.sectionTitle}>二维码打印助手</Text>
        <Text style={styles.metaText}>推荐尺寸：8cm x 8cm；建议打印在台卡并放置于收银台正中。</Text>
        <Text style={styles.metaText}>步骤：导出打印图 → 发送到打印店或蓝牙打印机 → 张贴后用顾客手机实测。</Text>
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
  },
  metaText: {
    ...mqTheme.typography.caption,
    color: '#405674',
  },
  modeRow: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c7d8f3',
    borderRadius: mqTheme.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f4f8ff',
  },
  modeBtnActive: {
    backgroundColor: '#e6efff',
    borderColor: mqTheme.colors.primary,
  },
  modeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#41597a',
  },
  modeTextActive: {
    color: '#123d75',
  },
  qrCard: {
    gap: mqTheme.spacing.sm,
  },
  qrWrap: {
    width: '100%',
    minHeight: 260,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.lg,
    backgroundColor: mqTheme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  cameraWrap: {
    width: '100%',
    height: 260,
    borderRadius: mqTheme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    backgroundColor: '#0b1220',
  },
  cameraView: {
    width: '100%',
    height: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  errorText: {
    fontSize: 13,
    color: mqTheme.colors.danger,
    fontWeight: '600',
  },
});
