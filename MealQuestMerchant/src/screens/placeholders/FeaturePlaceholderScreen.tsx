import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import AppShell from '../../components/ui/AppShell';
import SurfaceCard from '../../components/ui/SurfaceCard';
import { mqTheme } from '../../theme/tokens';

type FeaturePlaceholderScreenProps = {
  title: string;
  subtitle: string;
  stepId: string;
  triageKey?: string;
};

export default function FeaturePlaceholderScreen({
  title,
  subtitle,
  stepId,
  triageKey,
}: FeaturePlaceholderScreenProps) {
  return (
    <AppShell>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <SurfaceCard style={styles.noticeCard}>
        <View style={styles.row}>
          <MaterialIcons name="track-changes" size={16} color={mqTheme.colors.primary} />
          <Text style={styles.stepBadge}>Roadmap {stepId}</Text>
        </View>
        <Text style={styles.body}>
          Layout shell is frozen in advance. This page is intentionally a placeholder until the step
          implementation is unblocked.
        </Text>
        {triageKey ? <Text style={styles.caption}>Triage: {triageKey}</Text> : null}
      </SurfaceCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingTop: mqTheme.spacing.md,
    gap: 4,
  },
  title: {
    ...mqTheme.typography.title,
    fontSize: 22,
  },
  subtitle: {
    ...mqTheme.typography.body,
  },
  noticeCard: {
    marginTop: mqTheme.spacing.md,
    backgroundColor: '#f7faff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: mqTheme.colors.primary,
  },
  body: {
    ...mqTheme.typography.body,
    color: '#30415d',
  },
  caption: {
    ...mqTheme.typography.caption,
    color: mqTheme.colors.inkMuted,
  },
});
