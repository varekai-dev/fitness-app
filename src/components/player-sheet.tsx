import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, radius, spacing } from '@/theme';

const SPRING = { damping: 22, stiffness: 200, mass: 0.8 };

const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

/**
 * Draggable sheet for the workout player. Collapsed, only `header` (the player
 * card) shows, flush with the bottom edge, so it should pad itself for the bottom
 * inset. Dragging up or tapping the handle on top of the card reveals `children`
 * over a backdrop that fades in. `progress` (0 collapsed → 1 expanded) lets the
 * parent animate along with it.
 */
export function PlayerSheet({
  header,
  children,
  topInset,
  bottomInset,
  progress,
  onCollapsedHeight,
}: {
  header: ReactNode;
  children: ReactNode;
  topInset: number;
  bottomInset: number;
  progress: SharedValue<number>;
  /** Reports how much of the screen the collapsed sheet covers. */
  onCollapsedHeight?: (height: number) => void;
}) {
  const { height: screenH } = useWindowDimensions();
  const sheetH = screenH - topInset;
  const [headerH, setHeaderH] = useState(0);
  const collapsedY = Math.max(0, sheetH - headerH);

  const y = useSharedValue(sheetH);
  const startY = useSharedValue(0);
  const expanded = useSharedValue(false);

  // Keep the collapsed position in sync as the player card changes height.
  useEffect(() => {
    if (headerH === 0) return;
    if (!expanded.get()) y.set(withSpring(collapsedY, SPRING));
    onCollapsedHeight?.(headerH);
  }, [collapsedY, headerH, expanded, y, onCollapsedHeight]);

  useAnimatedReaction(
    () => (collapsedY > 0 ? 1 - y.get() / collapsedY : 0),
    (value) => progress.set(Math.min(1, Math.max(0, value))),
  );

  const snap = (open: boolean) => {
    'worklet';
    if (open !== expanded.get()) scheduleOnRN(tick);
    expanded.set(open);
    y.set(withSpring(open ? 0 : collapsedY, SPRING));
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => {
      startY.set(y.get());
    })
    .onUpdate((e) => {
      const next = startY.get() + e.translationY;
      // Rubber-band a little past either end instead of stopping dead.
      const over = next < 0 ? next : next > collapsedY ? next - collapsedY : 0;
      y.set(Math.min(collapsedY, Math.max(0, next)) + over * 0.2);
    })
    .onEnd((e) => {
      const open = e.velocityY < -500 || (e.velocityY <= 500 && y.get() < collapsedY / 2);
      snap(open);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 0.6]),
  }));
  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.get(), [0, 1], [1, 0.96]) }],
  }));
  // The sheet's own background only shows once it starts opening.
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.3], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.backdrop, backdropStyle]} />
      <Animated.View style={[styles.sheet, { height: sheetH }, sheetStyle]}>
        <Animated.View pointerEvents="none" style={[styles.surface, surfaceStyle]} />
        <GestureDetector gesture={pan}>
          <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
            <Animated.View style={headerStyle}>{header}</Animated.View>
            <Pressable hitSlop={12} style={styles.handleArea} onPress={() => snap(!expanded.get())}>
              <View style={styles.handle} />
            </Pressable>
          </View>
        </GestureDetector>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.xl }]}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
}

/** Wraps a list row so it slides and fades in, one after another, as the sheet opens. */
export function SheetItem({
  progress,
  index,
  children,
}: {
  progress: SharedValue<number>;
  index: number;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    // Each row starts a bit later than the previous one.
    const start = Math.min(0.15 + index * 0.08, 0.7);
    const t = interpolate(progress.get(), [start, start + 0.3], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 24 }, { scale: 0.96 + t * 0.04 }],
    };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  surface: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg + 10,
    borderTopRightRadius: radius.lg + 10,
  },
  // Overlaid on the card's top edge.
  handleArea: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  content: { paddingHorizontal: spacing.md, gap: spacing.md },
});
