import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { mqTheme } from '../../theme/tokens';

type StatTileProps = {
  label: string;
  value: string | number;
};

export default function StatTile({ label, value }: StatTileProps) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: mqTheme.radius.md,
    paddingHorizontal: mqTheme.spacing.sm,
    paddingVertical: mqTheme.spacing.sm,
    backgroundColor: mqTheme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    gap: 2,
  },
  label: {
    ...mqTheme.typography.caption,
    color: mqTheme.colors.inkMuted,
  },
  value: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: mqTheme.colors.ink,
  },
});
