import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../../theme';
import { haptics } from '../../lib/haptics';

// ToastProvider wraps the whole app, above NavigationContainer, so it can't
// rely on useSafeAreaInsets — that context is only supplied inside
// react-navigation's own tree (via its internal SafeAreaProviderCompat).
// Mirrors the fixed top offset AppHeader already uses for the same reason.
const TOP_OFFSET = Platform.OS === 'ios' ? 56 : 32;

type ToastType = 'success' | 'error' | 'info';
type ToastOptions = { message: string; type?: ToastType; duration?: number };
type ToastContextValue = { show: (options: ToastOptions | string) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

const TYPE_META: Record<ToastType, { bg: string; icon: keyof typeof Ionicons.glyphMap; haptic: () => void }> = {
  success: { bg: colors.slate[800], icon: 'checkmark-circle', haptic: haptics.success },
  error: { bg: colors.danger, icon: 'alert-circle', haptic: haptics.error },
  info: { bg: colors.slate[800], icon: 'information-circle', haptic: () => {} },
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const show = useCallback(
    (options: ToastOptions | string) => {
      const opts: ToastOptions = typeof options === 'string' ? { message: options } : options;
      const type = opts.type ?? 'info';

      if (hideTimer.current) clearTimeout(hideTimer.current);
      TYPE_META[type].haptic();
      setToast({ message: opts.message, type });
      opacity.setValue(0);
      translateY.setValue(-12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start();

      hideTimer.current = setTimeout(hide, opts.duration ?? 2800);
    },
    [opacity, translateY, hide]
  );

  const meta = toast ? TYPE_META[toast.type] : null;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && meta && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            { top: TOP_OFFSET, opacity, transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.toast, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={18} color={colors.white} style={styles.icon} />
            <Text style={[typography.bodyMedium, styles.text]} numberOfLines={2}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 999,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 480,
    width: '100%',
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    color: colors.white,
    flexShrink: 1,
  },
});
