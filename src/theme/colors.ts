// Single source of truth for color. These values codify the palette that was
// already dominant across the app (Slate neutrals + iOS-green brand + Tailwind
// blue/red/amber accents) rather than inventing a new one — the goal is
// consistency, not a redesign.

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
  50: '#F0FDF4',
  100: '#DCFCE7',
  500: '#34C759',
  600: '#22A745',
  700: '#15803D',
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
  brand: green[500],
  brandPressed: green[600],
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
