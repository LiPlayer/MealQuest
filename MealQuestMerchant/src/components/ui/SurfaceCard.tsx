import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { mqTheme } from '../../theme/tokens';

type SurfaceCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function SurfaceCard({ children, style }: SurfaceCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: mqTheme.colors.surface,
    borderRadius: mqTheme.radius.lg,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    padding: mqTheme.spacing.md,
    gap: mqTheme.spacing.sm,
    ...mqTheme.shadow.card,
  },
});
