import { Platform } from 'react-native';

// Cross-platform elevation presets — Platform.select so Android gets
// `elevation` (its shadow model) and iOS/web get the shadow* properties.
function shadow(elevation: number, opacity: number, radius: number, offsetY: number) {
  return Platform.select({
    android: { elevation },
    default: {
      shadowColor: '#0F172A',
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: offsetY },
    },
  });
}

export const shadows = {
  none: {},
  sm: shadow(2, 0.06, 4, 1),
  md: shadow(4, 0.08, 8, 2),
  lg: shadow(8, 0.12, 16, 4),
};
