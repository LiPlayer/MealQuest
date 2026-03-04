import { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';

import { ApiDataService } from '@/services/ApiDataService';
import { resolveStartupIntent, StartupIntent, toIndexUrl } from '@/services/customerApp/entryService';
import { storage } from '@/utils/storage';

import './index.scss';

function getEntryCandidate(options: Record<string, unknown>): string {
  const raw = options.id || options.storeId || options.merchantId || options.scene || '';
  return String(raw || '');
}

export default function StartupPage() {
  const router = useRouter();
  const [readyForScan, setReadyForScan] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const enterStore = useCallback(async (intent: StartupIntent): Promise<boolean> => {
    const merchantId = String(intent.merchantId || '').trim();
    if (!merchantId) {
      return false;
    }
    if (!ApiDataService.isConfigured()) {
      setErrorMessage('Service not configured');
      Taro.showToast({ title: 'Service not configured', icon: 'none' });
      return false;
    }

    const exists = await ApiDataService.isMerchantAvailable(merchantId);
    if (!exists) {
      setErrorMessage('Store not found');
      Taro.showToast({ title: 'Store not found', icon: 'none' });
      return false;
    }

    storage.setLastStoreId(merchantId);
    try {
      // Warm up customer session + home snapshot so index page opens with stable data.
      await ApiDataService.getHomeSnapshot(merchantId);
    } catch (error) {
      console.warn('[Startup] prefetch home snapshot failed', error);
    }
    Taro.reLaunch({ url: toIndexUrl(intent) });
    return true;
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const options = (router.params || {}) as Record<string, unknown>;
      const entryInput = getEntryCandidate(options);
      if (entryInput) {
        const entered = await enterStore(resolveStartupIntent(entryInput, options));
        if (!entered && active) {
          setReadyForScan(true);
        }
        return;
      }

      const lastStore = storage.getLastStoreId();
      if (lastStore) {
        const entered = await enterStore(resolveStartupIntent(lastStore));
        if (entered) {
          return;
        }
        storage.removeLastStoreId();
      }
      if (active) {
        setReadyForScan(true);
      }
    };

    bootstrap().catch((error) => {
      console.warn('[Startup] bootstrap failed', error);
      if (active) {
        setReadyForScan(true);
      }
    });

    return () => {
      active = false;
    };
  }, [enterStore, router.params]);

  const handleScan = useCallback(() => {
    Taro.scanCode({
      success: async (result) => {
        const intent = resolveStartupIntent(String(result.result || ''));
        const entered = await enterStore(intent);
        if (!entered) {
          Taro.showToast({ title: '二维码无效，请重试', icon: 'none' });
        }
      },
      fail: () => {
        Taro.showToast({ title: '扫码失败，请重试', icon: 'none' });
      },
    });
  }, [enterStore]);

  if (!readyForScan) {
    return (
      <View className='startup-loading'>
        <View className='startup-loading__spinner' />
        <Text className='startup-loading__text'>正在进入门店...</Text>
      </View>
    );
  }

  return (
    <View className='startup-page'>
      <View className='startup-panel'>
        <Text className='startup-panel__title'>Welcome to MealQuest</Text>
        <Text className='startup-panel__desc'>请扫码入店，领取你的专属资产与活动。</Text>
        <View id='startup-scan-button' className='startup-panel__button' onClick={handleScan}>
          <Text className='startup-panel__button-text'>扫一扫入店</Text>
        </View>
        {errorMessage ? <Text className='startup-panel__error'>{errorMessage}</Text> : null}
      </View>
    </View>
  );
}
