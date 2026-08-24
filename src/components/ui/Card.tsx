import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { colors, radii, shadows, spacing } from '../../theme';

type Props = ViewProps & {
  padded?: boolean;
  elevated?: boolean;
};

export default function Card({ padded = true, elevated = true, style, children, ...rest }: Props) {
  return (
    <View
      style={[
        styles.base,
        padded && { padding: spacing.lg },
        elevated ? shadows.sm : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
