import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme';

// Checked once: both are static for the lifetime of the app.
const nativeGlass =
  Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/**
 * Translucent "glass" surface. Uses iOS 26 Liquid Glass where available and a
 * blur with a dark tint elsewhere. `tint` colours the glass (and is the fallback
 * fill); `interactive` lets Liquid Glass react to touches.
 */
export function Glass({
  children,
  style,
  tint,
  interactive,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: string;
  interactive?: boolean;
}) {
  if (nativeGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={tint}
        isInteractive={interactive}
        style={style}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[styles.fallback, style]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint ?? 'rgba(30,30,30,0.6)' }]} />
      {children}
    </View>
  );
}

/** Soft accent glows behind a screen, so translucent surfaces have something to show. */
export function Backdrop() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="glowTop" cx="85%" cy="0%" r="70%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.16} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glowSide" cx="0%" cy="60%" r="55%">
          <Stop offset="0" stopColor={colors.accentGradientEnd} stopOpacity={0.08} />
          <Stop offset="1" stopColor={colors.accentGradientEnd} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#glowTop)" />
      <Rect width="100%" height="100%" fill="url(#glowSide)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fallback: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
