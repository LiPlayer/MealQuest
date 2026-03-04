import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

const ENTRY_QR_FILE_PREFIX = 'mealquest-entry-qr';
const ENTRY_QR_MIME_TYPE = 'image/png';

function requireMerchantId(merchantId: string): string {
  const normalized = String(merchantId || '').trim();
  if (!normalized) {
    throw new Error('merchantId is required');
  }
  return normalized;
}

function requireBase64Png(base64Png: string): string {
  const normalized = String(base64Png || '').trim();
  if (!normalized) {
    throw new Error('qr base64 payload is empty');
  }
  return normalized;
}

export async function writeEntryQrPngFile(params: {
  merchantId: string;
  base64Png: string;
}): Promise<string> {
  const merchantId = requireMerchantId(params.merchantId);
  const base64Png = requireBase64Png(params.base64Png);
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('cache directory is unavailable');
  }

  const fileName = `${ENTRY_QR_FILE_PREFIX}-${merchantId}-${Date.now()}.png`;
  const fileUri = `${cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64Png, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

export async function saveEntryQrToLibrary(fileUri: string): Promise<void> {
  const normalizedUri = String(fileUri || '').trim();
  if (!normalizedUri) {
    throw new Error('fileUri is required');
  }

  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('media library permission denied');
  }
  await MediaLibrary.saveToLibraryAsync(normalizedUri);
}

export async function shareEntryQrImage(fileUri: string): Promise<void> {
  const normalizedUri = String(fileUri || '').trim();
  if (!normalizedUri) {
    throw new Error('fileUri is required');
  }
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new Error('sharing is not available on this device');
  }
  await Sharing.shareAsync(normalizedUri, {
    mimeType: ENTRY_QR_MIME_TYPE,
    dialogTitle: 'Share entry QR code',
  });
}
