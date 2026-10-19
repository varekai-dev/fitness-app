import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import type { IconName } from '@/components/ui';
import { useEnabledModules } from '@/lib/modules';
import { colors, radius, spacing } from '@/theme';

const BAR_HEIGHT = 72;
const BUBBLE = 56;
const SIDE_MARGIN = spacing.lg;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };
/** Underdamped, so the "+" overshoots upward and settles back. */
const FAB_SPRING = { damping: 9, stiffness: 260, mass: 0.8 };
/** How far below its spot the "+" hides. */
const FAB_DROP = 48;
/** Wait for the tab's shift transition (150 ms) before popping up. */
const FAB_ENTER_DELAY = 150;

/** Vertical space screens should leave at the bottom so content clears the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  const hasBar = useEnabledModules().length > 1;
  return (hasBar ? BAR_HEIGHT : 0) + Math.max(insets.bottom, spacing.md) + spacing.lg;
}

/** Space a screen should leave below its content for a `TabBarFab` above the bar. */
export const TAB_BAR_FAB_SPACE = BUBBLE + spacing.md;

/**
 * Round glass "+" floating above the right end of the bar, lined up with the
 * last tab. Render it after the screen's scroll view, inside a `flex: 1` box.
 */
export function TabBarFab({ label, onPress }: { label: string; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const bottom = useTabBarSpace();
  const tabCount = useEnabledModules().length;
  const slot = (width - 2 * SIDE_MARGIN) / tabCount;
  // Without a bar (one section left) the button sits in the corner instead.
  const right = SIDE_MARGIN + (tabCount > 1 ? (slot - BUBBLE) / 2 : 0);
  // 0 = in place, 1 = tucked down out of sight.
  const hidden = useSharedValue(1);

  // Instead of sliding sideways with the tab switch, the button drops out when the tab
  // loses focus and, once the new tab has shifted in, pops up past its spot and settles.
  useFocusEffect(
    useCallback(() => {
      hidden.set(withDelay(FAB_ENTER_DELAY, withSpring(0, FAB_SPRING)));
      return () => hidden.set(withTiming(1, { duration: 120 }));
    }, [hidden]),
  );

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(hidden.get(), [0, 0.6], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: hidden.get() * FAB_DROP }],
  }));

  return (
    <Animated.View style={[styles.fabSpot, { bottom, right }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        style={({ pressed }) => pressed && styles.fabPressed}>
        {/* Denser than the bar: it floats over list text, which must not show through. */}
        <Glass interactive tint="rgba(30,30,30,0.9)" style={styles.fab}>
          <Ionicons name="add" size={28} color={colors.accent} />
        </Glass>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Floating pill tab bar, shown while there are at least two tabs: glass
 * background, outline icons, and an accent bubble that springs to the active tab.
 * `icons` maps route names to the base Ionicons name; the outline variant is used
 * for inactive tabs.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  icons,
}: BottomTabBarProps & { icons: Record<string, IconName> }) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const slot = width / state.routes.length;
  const x = useSharedValue(0);

  useEffect(() => {
    if (slot > 0) x.set(withSpring(slot * state.index + (slot - BUBBLE) / 2, SPRING));
  }, [slot, state.index, x]);

  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  // A lone section needs no tab bar.
  if (state.routes.length < 2) return null;

  return (
    <View
      style={[styles.wrapper, { bottom: Math.max(insets.bottom, spacing.md) }]}
      pointerEvents="box-none">
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Glass style={styles.bar}>
          {width > 0 && <Animated.View style={[styles.bubble, bubbleStyle]} />}
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const icon = icons[route.name] ?? 'ellipse';
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };
            return (
              <TabItem
                key={route.key}
                label={options.title ?? route.name}
                icon={icon}
                focused={focused}
                onPress={onPress}
              />
            );
          })}
        </Glass>
      </View>
    </View>
  );
}

/** A tab button: while held, the icon shrinks and a soft highlight circle grows behind it. */
function TabItem({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(focused ? 1.1 : 1);
  const press = useSharedValue(0);
  useEffect(() => {
    scale.set(withSpring(focused ? 1.1 : 1, SPRING));
  }, [focused, scale]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() * (1 - 0.15 * press.get()) }],
  }));
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: press.get(),
    transform: [{ scale: 0.5 + 0.5 * press.get() }],
  }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => press.set(withTiming(1, { duration: 120 }))}
      onPressOut={() => press.set(withSpring(0, SPRING))}
      style={styles.item}>
      <Animated.View style={[styles.highlight, highlightStyle]} pointerEvents="none" />
      <Animated.View style={iconStyle}>
        <Ionicons
          name={focused ? icon : (`${icon}-outline` as IconName)}
          size={24}
          color={focused ? colors.accentText : 'rgba(255,255,255,0.85)'}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: SIDE_MARGIN, right: SIDE_MARGIN },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubble: {
    position: 'absolute',
    left: 0,
    top: (BAR_HEIGHT - BUBBLE) / 2,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  item: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  highlight: {
    position: 'absolute',
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  fabSpot: { position: 'absolute' },
  fab: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: { opacity: 0.7 },
});
