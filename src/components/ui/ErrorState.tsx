import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import Button from './Button';

type Props = {
  message?: string;
  onRetry?: () => void;
};

export default function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }: Props) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={[typography.h3, styles.title]}>Couldn't load this</Text>
      <Text style={[typography.body, styles.message]}>{message}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="outline" size="sm" style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
  },
  title: {
    color: colors.textPrimary,
  },
  message: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  action: {
    marginTop: spacing.lg,
  },
});
