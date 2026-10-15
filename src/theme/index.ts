// src/theme/index.ts
export const COLORS = {
  background: '#000000',
  surface: '#121212',
  surfaceLight: '#1C1C1E',
  surfaceHighlight: '#2C2C2E',
  primary: '#FFFFFF',
  accent: '#D4FF00', // Neon Lime
  accentDark: '#AACC00',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textMuted: '#48484A',
  danger: '#FF453A',
  success: '#30D158',
  border: '#2C2C2E',
  transparent: 'transparent',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const TYPOGRAPHY = {
  hero: {
    fontSize: 42,
    fontWeight: '900' as const,
    letterSpacing: -1.5,
    color: COLORS.text,
  },
  h1: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    color: COLORS.text,
  },
  h2: {
    fontSize: 22,
    fontWeight: '800' as const,
    letterSpacing: -0.3,
    color: COLORS.text,
  },
  h3: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: COLORS.text,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: COLORS.textMuted,
  },
  label: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: COLORS.textSecondary,
  },
};

export const SHADOWS = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  heavy: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  },
};