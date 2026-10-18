import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import type { IconName } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const BAR_HEIGHT = 72;
const BUBBLE = 56;
const SIDE_MARGIN = spacing.lg;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };

/** Vertical space screens should leave at the bottom so content clears the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + Math.max(insets.bottom, spacing.md) + spacing.lg;
}

/** Space a screen should leave below its content for a `TabBarFab` above the bar. */
export const TAB_BAR_FAB_SPACE = BUBBLE + spacing.md;

/**
 * Round glass "+" floating above the right end of the bar, lined up with the
 * last of `tabCount` tabs. Render it after the screen's scroll view, inside a `flex: 1` box.
 */
export function TabBarFab({
  tabCount,
  label,
  onPress,
}: {
  tabCount: number;
  label: string;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  const bottom = useTabBarSpace();
  const slot = (width - 2 * SIDE_MARGIN) / tabCount;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.fabSpot,
        { bottom, right: SIDE_MARGIN + (slot - BUBBLE) / 2 },
        pressed && styles.fabPressed,
      ]}>
      {/* Denser than the bar: it floats over list text, which must not show through. */}
      <Glass interactive tint="rgba(30,30,30,0.9)" style={styles.fab}>
        <Ionicons name="add" size={28} color={colors.accent} />
      </Glass>
    </Pressable>
  );
}

/**
 * Floating pill tab bar: glass background, outline icons, and an
 * accent bubble that springs to the active tab. `icons` maps route names to the
 * base Ionicons name; the outline variant is used for inactive tabs.
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
                Haptics.selectionAsync();
                navigation.navigate(route.name, route.params);
              }
            };
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={options.title ?? route.name}
                onPress={onPress}
                style={styles.item}>
                <TabIcon name={icon} focused={focused} />
              </Pressable>
            );
          })}
        </Glass>
      </View>
    </View>
  );
}

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const scale = useSharedValue(focused ? 1.1 : 1);
  useEffect(() => {
    scale.set(withSpring(focused ? 1.1 : 1, SPRING));
  }, [focused, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={style}>
      <Ionicons
        name={focused ? name : (`${name}-outline` as IconName)}
        size={24}
        color={focused ? colors.accentText : 'rgba(255,255,255,0.85)'}
      />
    </Animated.View>
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
