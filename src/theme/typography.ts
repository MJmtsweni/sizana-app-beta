// Type scale. `fontFamily` is undefined until useAppFonts() finishes loading
// Inter (see src/theme/useAppFonts.ts) — undefined falls back to the OS
// system font, so screens render correctly even before fonts are ready.
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
};

export const typography = {
  display: { fontFamily: fontFamily.extrabold, fontSize: 30, lineHeight: 36 },
  h1: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 30 },
  h2: { fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22 },
  bodyLarge: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  bodyMedium: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
  captionMedium: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20 },
};
