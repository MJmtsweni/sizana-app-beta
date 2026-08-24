import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../../theme';
import { haptics } from '../../lib/haptics';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

const SIZE_STYLES: Record<Size, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 36, paddingHorizontal: spacing.lg, fontSize: 13 },
  md: { height: 48, paddingHorizontal: spacing.xl, fontSize: 15 },
  lg: { height: 56, paddingHorizontal: spacing.xxl, fontSize: 16 },
};

const VARIANT_STYLES: Record<Variant, { bg: string; border?: string; text: string }> = {
  primary: { bg: colors.brand, text: colors.textInverse },
  secondary: { bg: colors.brandSubtle, text: colors.brand },
  outline: { bg: 'transparent', border: colors.borderStrong, text: colors.textPrimary },
  ghost: { bg: 'transparent', text: colors.brand },
  danger: { bg: colors.danger, text: colors.textInverse },
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];

  const handlePress = (e: GestureResponderEvent) => {
    if (isDisabled) return;
    haptics.tap();
    onPress(e);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: v.border ? 1 : 0,
          height: s.height,
          paddingHorizontal: s.paddingHorizontal,
          opacity: isDisabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && <Ionicons name={icon} size={s.fontSize + 3} color={v.text} style={styles.icon} />}
          <Text style={[typography.button, { color: v.text, fontSize: s.fontSize }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
});
