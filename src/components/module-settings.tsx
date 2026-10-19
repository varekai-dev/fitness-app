import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import Animated, {
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Glass } from '@/components/glass';
import { PressScale } from '@/components/motion';
import { Text, type IconName } from '@/components/ui';
import { tr } from '@/lib/i18n';
import {
  MODULE_INFO,
  setModuleEnabled,
  setModuleOrder,
  useEnabledModules,
  useModuleOrder,
  type AppModule,
} from '@/lib/modules';
import { colors, radius, spacing } from '@/theme';

const BAR_HEIGHT = 64;
const BUBBLE = 48;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };
const SLIDE = LinearTransition.springify().damping(18).stiffness(220);

/**
 * Sections of the app switched on and off. A copy of the tab bar on top
 * shows live which tabs are left; the data of a switched-off section is kept.
 */
export function ModuleSettings() {
  const enabled = useEnabledModules();
  const order = useModuleOrder();
  const [width, setWidth] = useState(0);
  const slot = width / enabled.length;
  // The app opens on Home while it's on, otherwise on the first tab.
  const active = Math.max(enabled.indexOf('home'), 0);
  // Like the real tab bar, one bubble springs to the open tab as the slots move.
  // A rounded view inside a layout-animated slot comes out square on Android.
  const x = useSharedValue(0);
  useEffect(() => {
    if (slot > 0) x.set(withSpring(slot * active + (slot - BUBBLE) / 2, SPRING));
  }, [slot, active, x]);
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const single = enabled.length === 1;

  return (
    <View style={styles.root}>
      <Text variant="overline">{tr('Розділи', 'Sections')}</Text>
      <View style={styles.preview}>
        {/* With one section left the app has no tab bar, so its copy fades. */}
        <Glass style={[styles.bar, single && styles.faded]}>
          <View style={styles.fill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} />
          {width > 0 && <Animated.View style={[styles.bubble, bubbleStyle]} />}
          {enabled.map((m, i) => (
            <Animated.View
              key={m}
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(160)}
              layout={SLIDE}
              style={styles.slot}>
              <Ionicons
                name={
                  i === active
                    ? MODULE_INFO[m].icon
                    : (`${MODULE_INFO[m].icon}-outline` as IconName)
                }
                size={22}
                color={i === active ? colors.accentText : 'rgba(255,255,255,0.85)'}
              />
            </Animated.View>
          ))}
        </Glass>
        <Text variant="muted" style={styles.center}>
          {single
            ? tr(
                'Лишився один розділ, тож меню внизу не буде',
                'Only one section is left, so there’s no tab bar',
              )
            : tr('Так виглядатиме меню навігації', 'This is how the tab bar will look')}
        </Text>
      </View>

      {/* Dragged by the handle, so the rest of the card still flips the switch and the page scrolls. */}
      <Sortable.Grid
        columns={1}
        rowGap={spacing.lg}
        data={[...order]}
        keyExtractor={(m) => m}
        customHandle
        activeItemScale={1.03}
        inactiveItemOpacity={0.8}
        onDragEnd={({ data }) => setModuleOrder(data)}
        renderItem={({ item: m }) => (
          <ModuleCard
            module={m}
            on={enabled.includes(m)}
            locked={enabled.length === 1 && enabled[0] === m}
          />
        )}
      />

      <Text variant="muted">
        {tr(
          'Тягни за ручку праворуч, щоб змінити порядок у меню. Вимкнений розділ зникає з меню, головної, налаштувань і сповіщень. Дані нікуди не діваються: увімкни його знову, і все повернеться.',
          'Drag a card by the handle on the right to reorder the tab bar. A switched-off section leaves the tab bar, the home screen, settings and notifications. Its data stays: switch it back on and everything returns.',
        )}
      </Text>
    </View>
  );
}

/** A section with its switch; the whole card flips it. The last section left can't be switched off. */
function ModuleCard({ module, on, locked }: { module: AppModule; on: boolean; locked: boolean }) {
  const info = MODULE_INFO[module];
  const progress = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(on ? 1 : 0, { duration: 220 }));
  }, [on, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * progress.get(),
    borderColor: interpolateColor(progress.get(), [0, 1], [colors.surface, colors.accentSoft]),
  }));
  const iconStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 1],
      [colors.surfaceRaised, colors.accent],
    ),
    transform: [{ scale: 0.9 + 0.1 * progress.get() }],
  }));

  const toggle = (next: boolean) => {
    if (!locked) setModuleEnabled(module, next);
  };

  return (
    <PressScale
      onPress={() => toggle(!on)}
      disabled={locked}
      accessibilityRole="switch"
      accessibilityLabel={info.title}
      accessibilityState={{ checked: on, disabled: locked }}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Animated.View style={[styles.icon, iconStyle]}>
          <Ionicons name={info.icon} size={24} color={on ? colors.accentText : colors.text} />
        </Animated.View>
        <View style={styles.flex}>
          <Text variant="heading">{info.title}</Text>
          <Text variant="muted">
            {locked
              ? tr('Хоча б один розділ має лишитися.', 'At least one section has to stay.')
              : info.description}
          </Text>
        </View>
        <Switch
          value={on}
          disabled={locked}
          onValueChange={toggle}
          trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
          thumbColor={colors.text}
        />
        <Sortable.Handle>
          <View
            style={styles.handle}
            accessibilityLabel={tr(`Перемістити «${info.title}»`, `Move “${info.title}”`)}>
            <Ionicons name="reorder-three" size={24} color={colors.textSecondary} />
          </View>
        </Sortable.Handle>
      </Animated.View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  faded: { opacity: 0.35 },
  preview: { gap: spacing.sm, marginBottom: spacing.sm },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  bubble: {
    position: 'absolute',
    left: 0,
    top: (BAR_HEIGHT - BUBBLE) / 2,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: colors.accent,
  },
  center: { textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  // A wide target, reaching to the card's edge.
  handle: { paddingVertical: spacing.md, paddingLeft: spacing.xs, marginRight: -spacing.sm },
});
