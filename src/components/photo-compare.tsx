import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export type CompareSide = { uri: string; label: string; detail?: string };

const KNOB = 40;

const tick = () => Haptics.selectionAsync();

/**
 * Two photos on top of each other: "before" shows left of the divider and
 * "after" right of it. Dragging (or tapping) moves the divider.
 */
export function PhotoCompare({ before, after }: { before: CompareSide; after: CompareSide }) {
  const [width, setWidth] = useState(0);
  const height = (width * 4) / 3;
  // Where the divider is, 0 (all "after") to 1 (all "before").
  const split = useSharedValue(0.5);
  const atEdge = useSharedValue(false);

  const moveTo = (x: number) => {
    'worklet';
    if (width === 0) return;
    const next = Math.min(Math.max(x / width, 0), 1);
    const edge = next === 0 || next === 1;
    if (edge && !atEdge.get()) scheduleOnRN(tick);
    atEdge.set(edge);
    split.set(next);
  };

  const pan = Gesture.Pan()
    // Horizontal drags only, so the screen still scrolls past the photos.
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onUpdate((e) => moveTo(e.x));
  const tap = Gesture.Tap().onEnd((e) => {
    if (width === 0) return;
    split.set(withTiming(Math.min(Math.max(e.x / width, 0), 1), { duration: 200 }));
  });

  const clipStyle = useAnimatedStyle(() => ({ width: split.get() * width }));
  const dividerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: split.get() * width }],
  }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        style={[styles.frame, { height: height || undefined }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <>
            <Image source={{ uri: after.uri }} style={styles.fill} contentFit="cover" />
            <Animated.View style={[styles.clip, clipStyle]}>
              <Image source={{ uri: before.uri }} style={{ width, height }} contentFit="cover" />
            </Animated.View>
            <Animated.View style={[styles.divider, dividerStyle]} pointerEvents="none">
              <View style={styles.line} />
              <View style={styles.knob}>
                <Ionicons name="chevron-back" size={16} color={colors.accentText} />
                <Ionicons name="chevron-forward" size={16} color={colors.accentText} />
              </View>
            </Animated.View>
            <Caption side={before} style={styles.captionLeft} />
            <Caption side={after} style={styles.captionRight} />
          </>
        )}
      </View>
    </GestureDetector>
  );
}

function Caption({ side, style }: { side: CompareSide; style: object }) {
  return (
    <View style={[styles.caption, style]} pointerEvents="none">
      <Text style={styles.captionLabel}>{side.label}</Text>
      {side.detail ? <Text style={styles.captionDetail}>{side.detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  fill: { ...StyleSheet.absoluteFill },
  clip: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -KNOB / 2,
    width: KNOB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.accent,
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    bottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  captionLeft: { left: spacing.sm },
  captionRight: { right: spacing.sm, alignItems: 'flex-end' },
  captionLabel: { color: colors.text, fontWeight: '700', fontSize: 13 },
  captionDetail: { color: colors.textSecondary, fontSize: 11 },
});
