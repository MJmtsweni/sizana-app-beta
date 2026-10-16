// Single source of truth for color. The greens come from the Sizana brand kit
// (assets/brand/): #1B7133 is the logo's dark green and the primary brand
// color — white text on it is 6.1:1, comfortably past WCAG AA. #2DAD4D is the
// logo's light green, used for fills and icons only: white text on it is
// ~2.9:1, too low for buttons or body text. Slate neutrals and the blue/red/
// amber status accents are unchanged.

const slate = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
};

const green = {
  50: '#EEF8F1',
  100: '#D5EEDC',
  500: '#2DAD4D', // brand kit light green
  600: '#1B7133', // brand kit dark green — primary
  700: '#145627',
};

const blue = {
  50: '#EFF6FF',
  500: '#3B82F6',
  700: '#1E40AF',
};

const red = {
  50: '#FEF2F2',
  500: '#EF4444',
  700: '#B91C1C',
};

const amber = {
  50: '#FFFBEB',
  500: '#F59E0B',
  700: '#B45309',
};

export const colors = {
  slate,
  green,
  blue,
  red,
  amber,

  // Semantic tokens — prefer these over the raw scales above in screen code.
  brand: green[600],
  brandPressed: green[700],
  brandLight: green[500],
  brandSubtle: green[50],
  brandSubtleStrong: green[100],

  accent: blue[500],
  accentSubtle: blue[50],

  success: green[500],
  successSubtle: green[50],
  warning: amber[500],
  warningSubtle: amber[50],
  danger: red[500],
  dangerSubtle: red[50],

  whatsapp: '#25D366',

  textPrimary: slate[800],
  textSecondary: slate[500],
  textTertiary: slate[400],
  textInverse: '#FFFFFF',
  textDisabled: slate[300],

  background: '#FFFFFF',
  backgroundMuted: slate[50],
  surface: '#FFFFFF',
  border: slate[200],
  borderStrong: slate[300],

  overlay: 'rgba(15, 23, 42, 0.5)',
  white: '#FFFFFF',
  black: '#000000',
};

export type AppColors = typeof colors;
