import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function BootSplash() {
  return (
    <View style={styles.bootSplash}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.bootSplashText}>Validating session...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bootSplash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  bootSplashText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
});
