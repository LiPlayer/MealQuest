import React from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { mqTheme } from '../../theme/tokens';

type AppShellProps = {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export default function AppShell({
  children,
  scroll = false,
  edges = ['top', 'bottom'],
  style,
  contentContainerStyle,
}: AppShellProps) {
  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, style]}>
      <View style={styles.orbTop} pointerEvents="none" />
      <View style={styles.orbBottom} pointerEvents="none" />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mqTheme.colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: mqTheme.spacing.lg,
    paddingBottom: mqTheme.spacing.lg,
    gap: mqTheme.spacing.md,
  },
  scrollContent: {
    paddingHorizontal: mqTheme.spacing.lg,
    paddingBottom: mqTheme.spacing.xl,
    gap: mqTheme.spacing.md,
  },
  orbTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    top: -120,
    right: -80,
    borderRadius: 200,
    backgroundColor: mqTheme.colors.primarySoft,
  },
  orbBottom: {
    position: 'absolute',
    width: 190,
    height: 190,
    bottom: -110,
    left: -60,
    borderRadius: 200,
    backgroundColor: mqTheme.colors.accentSoft,
  },
});
