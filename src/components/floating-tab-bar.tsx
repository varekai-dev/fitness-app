import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const BAR_HEIGHT = 72;
const BUBBLE = 60;
const SIDE_MARGIN = spacing.lg;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };

/** Vertical space screens should leave at the bottom so content clears the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + Math.max(insets.bottom, spacing.md) + spacing.lg;
}

/**
 * Floating pill tab bar: translucent blurred background, outline icons, and an
 * orange bubble that springs to the active tab. `icons` maps route names to the
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
      <View style={styles.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.tint} />
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tint: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(30,30,30,0.6)',
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
});
