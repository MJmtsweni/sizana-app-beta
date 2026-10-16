import * as Haptics from 'expo-haptics';

// Thin wrapper so call sites don't import expo-haptics directly and so we
// have one place to silence failures (haptics can throw on devices/emulators
// without a vibration motor — that should never crash the interaction it's
// attached to).
function safe(fn: () => Promise<any>) {
  fn().catch(() => {});
}

export const haptics = {
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  selection: () => safe(() => Haptics.selectionAsync()),
};
