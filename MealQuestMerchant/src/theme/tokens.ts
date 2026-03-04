import { TextStyle, ViewStyle } from 'react-native';

export const mqColors = {
  ink: '#0b1220',
  inkMuted: '#516074',
  textOnDark: '#ecf3ff',
  bg: '#f3f7ff',
  surface: '#ffffff',
  surfaceAlt: '#eef4ff',
  border: '#d8e2f0',
  primary: '#0b5fff',
  primarySoft: '#dbe8ff',
  accent: '#00a6a6',
  accentSoft: '#d5fbfb',
  warning: '#c66f00',
  warningSoft: '#fff2dc',
  danger: '#bf2d3c',
  dangerSoft: '#ffe5e8',
} as const;

export const mqSpacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 30,
} as const;

export const mqRadius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const mqTypography = {
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: mqColors.ink,
  } satisfies TextStyle,
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: mqColors.inkMuted,
  } satisfies TextStyle,
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: mqColors.ink,
  } satisfies TextStyle,
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: mqColors.inkMuted,
  } satisfies TextStyle,
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: mqColors.inkMuted,
  } satisfies TextStyle,
} as const;

export const mqShadow = {
  card: {
    shadowColor: '#1d2f5f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  } satisfies ViewStyle,
  floating: {
    shadowColor: '#0f264f',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 7,
  } satisfies ViewStyle,
} as const;

export const mqTheme = {
  colors: mqColors,
  spacing: mqSpacing,
  radius: mqRadius,
  typography: mqTypography,
  shadow: mqShadow,
} as const;

export type MqTheme = typeof mqTheme;
