export const colors = {
  background: '#121212',
  surface: '#262626',
  surfaceRaised: '#333333',
  border: '#333333',
  // Translucent surfaces that let the screen backdrop show through.
  glass: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  text: '#FFFFFF',
  textSecondary: '#A3A3A3',
  textMuted: '#666666',
  accent: '#EAF46B',
  accentPressed: '#D6E055',
  // Text and icons on the accent are dark: the lime is too light for white.
  accentText: '#141414',
  accentSoft: 'rgba(234, 244, 107, 0.14)',
  accentGradientEnd: '#F5FAA8',
  onAccentMuted: 'rgba(20, 20, 20, 0.65)',
  onAccentFaint: 'rgba(20, 20, 20, 0.1)',
  danger: '#FF5A5A',
  warning: '#FFB020',
  // Protein, fat and carbs wherever they share one chart.
  protein: '#EAF46B',
  fat: '#FF9F6B',
  carbs: '#A78BFA',
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
