export const colors = {
  background: '#141414',
  surface: '#212121',
  surfaceRaised: '#2B2B2B',
  border: '#2F2F2F',
  // Translucent surfaces that let the screen backdrop show through.
  glass: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  text: '#FFFFFF',
  textSecondary: '#A3A3A3',
  textMuted: '#666666',
  accent: '#FF6B2C',
  accentPressed: '#E85A1E',
  accentText: '#FFFFFF',
  accentSoft: 'rgba(255, 107, 44, 0.14)',
  accentGradientEnd: '#FF8A4C',
  danger: '#FF5A5A',
  warning: '#FFB020',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  hero: 44,
} as const;
