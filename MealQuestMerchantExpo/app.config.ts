import 'dotenv/config';
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'MealQuestMerchantExpo',
  slug: 'mealquest-merchant-expo',
  scheme: 'mealquestmerchantexpo',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins: ['expo-dev-client'],
  android: {
    package: 'com.mealquestmerchant.expo',
  },
  ios: {
    bundleIdentifier: 'com.mealquestmerchant.expo',
    supportsTablet: true,
  },
  extra: {
    mqServerUrl: process.env.EXPO_PUBLIC_MQ_SERVER_URL || '',
  },
};

export default config;
