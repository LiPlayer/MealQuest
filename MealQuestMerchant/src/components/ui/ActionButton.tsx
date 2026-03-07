import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type ActionButtonVariant = 'primary' | 'secondary' | 'danger';

type ActionButtonProps = {
  label: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: ActionButtonVariant;
  testID?: string;
};

const variantMap: Record<
  ActionButtonVariant,
  {
    bg: string;
    fg: string;
    border: string;
  }
> = {
  primary: {
    bg: '#0b5fff',
    fg: '#ffffff',
    border: '#0b5fff',
  },
  secondary: {
    bg: '#eef4ff',
    fg: '#20324d',
    border: '#d8e2f0',
  },
  danger: {
    bg: '#ffe5e8',
    fg: '#a21d2f',
    border: '#ffcad0',
  },
};

export default function ActionButton({
  label,
  icon,
  onPress,
  busy = false,
  disabled = false,
  variant = 'primary',
  testID,
}: ActionButtonProps) {
  const ui = variantMap[variant];
  const inoperable = disabled || busy;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inoperable}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: ui.bg,
          borderColor: ui.border,
          opacity: inoperable ? 0.55 : pressed ? 0.9 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={ui.fg} />
      ) : (
        <>
          {icon ? <MaterialIcons name={icon} size={16} color={ui.fg} /> : null}
          <Text style={[styles.text, { color: ui.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
  },
});
