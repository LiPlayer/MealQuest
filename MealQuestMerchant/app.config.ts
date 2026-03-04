import 'dotenv/config';
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'MealQuestMerchant',
  slug: 'mealquest-merchant',
  scheme: 'mealquestmerchant',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins: [
    'expo-router',
    'expo-dev-client',
    [
      'expo-media-library',
      {
        photosPermission: 'Allow MealQuest Merchant to save entry QR images.',
      },
    ],
  ],
  android: {
    package: 'com.mealquestmerchant',
  },
  ios: {
    bundleIdentifier: 'com.mealquestmerchant',
    supportsTablet: true,
  },
  extra: {
    mqServerUrl: process.env.EXPO_PUBLIC_MQ_SERVER_URL || '',
  },
};

export default config;
