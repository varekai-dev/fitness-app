import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { tr } from '@/lib/i18n';
import { colors, radius, spacing } from '@/theme';

const SPRING = { damping: 22, stiffness: 200, mass: 0.8 };

/** The swipe that closes the sheet, for vertical scrollers inside it to block. */
const SheetPan = createContext<GestureType | null>(null);

/**
 * Wraps a vertical scroll view (a wheel, a list) inside a bottom sheet, so
 * dragging it scrolls rather than pulls the sheet down. Outside a sheet it
 * changes nothing.
 */
export function SheetScrollable({ children }: { children: ReactNode }) {
  const pan = useContext(SheetPan);
  const native = useMemo(() => (pan ? Gesture.Native().blocksExternalGesture(pan) : null), [pan]);
  if (!native) return children;
  return <GestureDetector gesture={native}>{children}</GestureDetector>;
}

/**
 * Modal sheet that slides up from the bottom edge, with rounded top corners and
 * a handle. Swiping it down, tapping the backdrop or the back button closes it:
 * each calls `onClose`, and the sheet slides away once `visible` turns false.
 * Horizontal swipes inside (a ruler, a carousel) stay with the content.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  // Stays mounted while the sheet slides away.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      {/* Gestures inside an Android modal need their own root view. */}
      <GestureHandlerRootView style={styles.flex}>
        {mounted && (
          <Sheet visible={visible} onClose={onClose} onHidden={setMounted}>
            {children}
          </Sheet>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Sheet({
  visible,
  onClose,
  onHidden,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onHidden: (mounted: boolean) => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  // How far the sheet sits below its open position: off screen until it opens.
  const y = useSharedValue(screenH);
  const sheetH = useSharedValue(screenH);

  useEffect(() => {
    if (visible) y.set(withSpring(0, SPRING));
    else
      y.set(
        withTiming(screenH, { duration: 220 }, (done) => {
          if (done) scheduleOnRN(onHidden, false);
        }),
      );
  }, [visible, screenH, y, onHidden]);

  // Kept stable, so scrollers inside block the same gesture across renders.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-12, 12])
        .onUpdate((e) => {
          // Rubber-bands a little when pulled up past the open position.
          y.set(e.translationY > 0 ? e.translationY : e.translationY * 0.2);
        })
        .onEnd((e) => {
          if (e.velocityY > 800 || y.get() > sheetH.get() * 0.3) scheduleOnRN(onClose);
          else y.set(withSpring(0, SPRING));
        }),
    [onClose, sheetH, y],
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, sheetH.get()], [0.6, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          style={styles.flex}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={tr('Закрити', 'Close')}
        />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={(e) => sheetH.set(e.nativeEvent.layout.height)}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }, sheetStyle]}>
          <View style={styles.handle} />
          <SheetPan.Provider value={pan}>{children}</SheetPan.Provider>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: '#000' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 10,
    borderTopRightRadius: radius.lg + 10,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
});
