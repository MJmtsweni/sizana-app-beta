import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../../theme';
import { useIsOnline } from '../../lib/network';

// Mirrors ToastProvider's fixed top offset — this renders above
// NavigationContainer too, so it can't rely on useSafeAreaInsets.
const TOP_OFFSET = Platform.OS === 'ios' ? 56 : 32;

export default function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <View pointerEvents="none" style={[styles.container, { top: TOP_OFFSET }]}>
      <View style={styles.banner}>
        <Ionicons name="cloud-offline" size={16} color={colors.textInverse} style={styles.icon} />
        <Text style={[typography.bodyMedium, styles.text]}>You're offline</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.slate[700],
    maxWidth: 480,
    width: '100%',
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    color: colors.textInverse,
    flexShrink: 1,
  },
});
