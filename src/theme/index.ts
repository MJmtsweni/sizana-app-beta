import { colors } from './colors';
import { spacing, radii } from './spacing';
import { shadows } from './shadows';
import { typography, fontFamily } from './typography';

export const theme = {
  colors,
  spacing,
  radii,
  shadows,
  typography,
  fontFamily,
};

export type Theme = typeof theme;

export { colors, spacing, radii, shadows, typography, fontFamily };
export { useAppFonts } from './useAppFonts';
