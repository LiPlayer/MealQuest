import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { mqTheme } from '../../theme/tokens';

type TopBarProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
};

export default function TopBar({ title, subtitle, onBack, rightSlot }: TopBarProps) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={18} color={mqTheme.colors.ink} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : (
        <View style={styles.backStub} />
      )}
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.rightSlot}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: mqTheme.spacing.sm,
    paddingTop: mqTheme.spacing.sm,
  },
  backBtn: {
    minWidth: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 13,
    fontWeight: '700',
    color: mqTheme.colors.ink,
  },
  backStub: {
    minWidth: 70,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...mqTheme.typography.sectionTitle,
    fontSize: 19,
  },
  subtitle: {
    ...mqTheme.typography.caption,
  },
  rightSlot: {
    minWidth: 48,
    alignItems: 'flex-end',
  },
});
