import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useId, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, CircleButton, Text } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { displayToMl, flOz, formatVolume, mlToDisplay, unitSystem, VOLUME_UNIT } from '@/lib/units';
import { GLASS_PRESETS, type GlassPreset } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Drawing coordinates shared by every container.
const VIEW_W = 200;
const VIEW_H = 260;

/**
 * A container's silhouette: `body` holds the water, `top`/`bottom` are the
 * water line when full and the inside bottom, `extra` is drawn outside the
 * water (a handle).
 */
type Shape = {
  body: string;
  top: number;
  bottom: number;
  extra?: 'cupHandle';
};

// In GLASS_PRESETS order: cup, glass, bottle.
const SHAPES: Shape[] = [
  {
    body: 'M36 84 H148 L140 212 C138 230 126 238 110 238 H74 C58 238 46 230 44 212 Z',
    top: 92,
    bottom: 238,
    extra: 'cupHandle',
  },
  {
    body: 'M38 24 H162 L148 228 C147 242 138 250 124 250 H76 C62 250 53 242 52 228 Z',
    top: 36,
    bottom: 250,
  },
  {
    body:
      'M84 14 H116 V34 C116 46 152 52 152 80 V232 C152 244 144 252 132 252 H68 ' +
      'C56 252 48 244 48 232 V80 C48 52 84 46 84 34 Z',
    top: 70,
    bottom: 252,
  },
];

// Amounts snap to 10 ml or 1 fl oz.
const STEP = unitSystem === 'imperial' ? 1 : 10;
// Room above the container's nominal size, so a fuller pour still fits.
const HEADROOM_ML = unitSystem === 'imperial' ? flOz(3) : 100;

const snap = (ml: number) => displayToMl(Math.round(mlToDisplay(ml) / STEP) * STEP);

/** The water as a wavy surface at `y`, filled down past the bottom. */
function wavePath(y: number, amplitude: number, phase: number) {
  'worklet';
  let d = '';
  for (let x = -10; x <= VIEW_W + 10; x += 8) {
    const wy = y + amplitude * Math.sin((x / VIEW_W) * Math.PI * 2.2 + phase);
    d += `${x === -10 ? 'M' : 'L'}${x} ${wy.toFixed(2)} `;
  }
  return `${d}L${VIEW_W + 10} ${VIEW_H + 10} L-10 ${VIEW_H + 10} Z`;
}

/** What the pour modal opens with: a container, and the amount of a logged drink being edited. */
export type PourRequest = { glass: GlassPreset; editMl?: number };

/**
 * Full-screen picker for one drink: the chosen container, poured to its
 * nominal size (or to the edited drink's amount) with room for a bit more,
 * whose water line follows a finger dragged up or down it. The chips switch
 * to another container; the button logs or saves the amount poured.
 */
export function WaterPourModal({
  pour,
  onClose,
  onAdd,
}: {
  /** `null` keeps the modal closed. */
  pour: PourRequest | null;
  onClose: () => void;
  onAdd: (ml: number) => void;
}) {
  // Kept while the modal slides away, so it doesn't go blank mid-animation.
  const [shown, setShown] = useState(pour);
  if (pour && pour !== shown) setShown(pour);

  return (
    <Modal
      visible={!!pour}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      {/* Gestures inside an Android modal need their own root view. */}
      <GestureHandlerRootView style={styles.flex}>
        {shown && (
          <PourContent
            initial={shown.glass}
            editMl={shown.editMl}
            onClose={onClose}
            onAdd={onAdd}
          />
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

function PourContent({
  initial,
  editMl,
  onClose,
  onAdd,
}: {
  initial: GlassPreset;
  editMl?: number;
  onClose: () => void;
  onAdd: (ml: number) => void;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [glass, setGlass] = useState(initial);
  const [amount, setAmount] = useState(editMl ?? initial.ml);
  const shapeIndex = Math.max(GLASS_PRESETS.indexOf(glass), 0);
  const shape = SHAPES[shapeIndex];

  // The drawing's height on screen and its scale from drawing coordinates.
  const drawH = Math.min(Math.max(screenH * 0.42, 220), 380);
  const scale = drawH / VIEW_H;
  const drawW = VIEW_W * scale;

  // The brim holds the nominal size plus some headroom (or the edited drink, if
  // bigger); it opens poured to the nominal size, or to the edited drink's amount.
  const startMl = glass === initial && editMl != null ? editMl : glass.ml;
  const capacity = Math.max(glass.ml + HEADROOM_ML, startMl);
  const nominal = glass.ml / capacity;
  const start = startMl / capacity;

  // 0 empty → 1 brim-full, as a share of the container's height.
  const level = useSharedValue(start);
  const phase = useSharedValue(0);
  const splash = useSharedValue(0);

  // Switching containers pours its nominal size again.
  useEffect(() => {
    level.set(0);
    level.set(withTiming(start, { duration: 450 }));
    splash.set(6);
  }, [start, level, splash]);

  useFrameCallback(({ timeSincePreviousFrame }) => {
    const dt = Math.min((timeSincePreviousFrame ?? 16) / 1000, 0.05);
    splash.set(splash.get() * Math.exp(-dt * 2));
    phase.set((phase.get() + dt * (2.4 + splash.get() * 0.5)) % (Math.PI * 200));
  });

  const top = shape.top;
  const bottom = shape.bottom;

  useAnimatedReaction(
    () => Math.round(level.get() * capacity),
    (ml, previous) => {
      if (ml === previous) return;
      scheduleOnRN(setAmount, ml);
    },
    [capacity],
  );

  // The finger sets the water line wherever it touches the container.
  const pour = (y: number) => {
    'worklet';
    const v = (bottom - y / scale) / (bottom - top);
    level.set(Math.min(Math.max(v, 0), 1));
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      pour(e.y);
      splash.set(Math.max(splash.get(), 3));
    })
    .onUpdate((e) => {
      pour(e.y);
      splash.set(Math.min(splash.get() + Math.abs(e.velocityY) * 0.0004, 7));
    });

  const surfaceY = () => {
    'worklet';
    // Empty sinks the surface below the bottom so the wave crests stay hidden.
    return level.get() > 0 ? bottom - level.get() * (bottom - top) : bottom + 10;
  };
  const frontProps = useAnimatedProps(() => ({
    d: wavePath(surfaceY(), 2.5 + splash.get(), phase.get()),
  }));
  const backProps = useAnimatedProps(() => ({
    d: wavePath(surfaceY() - 3, 2.5 + splash.get() * 0.8, phase.get() * 0.8 + Math.PI),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (bottom - level.get() * (bottom - top)) * scale - KNOB / 2 }],
  }));

  const ml = snap(amount);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <CircleButton icon="close" onPress={onClose} />
      </View>

      <View style={styles.body}>
        <GestureDetector gesture={pan}>
          <View
            style={{ width: drawW, height: drawH }}
            accessibilityRole="adjustable"
            accessibilityLabel={tr('Скільки налити', 'How much to pour')}
            accessibilityValue={{ text: `${formatVolume(ml)} ${VOLUME_UNIT}` }}>
            {/* Remounted per container: Android keeps a clip path's old outline otherwise. */}
            <Svg key={shapeIndex} width={drawW} height={drawH} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
              <Defs>
                <ClipPath id={`pour${id}${shapeIndex}`}>
                  <Path d={shape.body} />
                </ClipPath>
                <LinearGradient id={`water${id}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.accentGradientEnd} />
                  <Stop offset="0.45" stopColor={colors.accent} />
                  <Stop offset="1" stopColor="#9DB52E" />
                </LinearGradient>
              </Defs>
              {shape.extra === 'cupHandle' && (
                <Path
                  d="M144 112 C184 112 184 178 136 180"
                  fill="none"
                  stroke={colors.surfaceRaised}
                  strokeWidth={12}
                  strokeLinecap="round"
                />
              )}
              <Path d={shape.body} fill={colors.surface} />
              <G clipPath={`url(#pour${id}${shapeIndex})`}>
                <AnimatedPath
                  animatedProps={backProps}
                  fill={colors.accentGradientEnd}
                  opacity={0.4}
                />
                <AnimatedPath animatedProps={frontProps} fill={`url(#water${id})`} />
                <Rect
                  x={58}
                  y={top + 12}
                  width={8}
                  height={(bottom - top) * 0.7}
                  rx={4}
                  fill="rgba(255,255,255,0.12)"
                />
              </G>
              <Path d={shape.body} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={2.5} />
            </Svg>
            <Animated.View
              pointerEvents="none"
              style={[styles.knob, { left: drawW / 2 - KNOB / 2 }, knobStyle]}>
              <Ionicons name="chevron-expand" size={20} color={colors.accentText} />
            </Animated.View>
          </View>
        </GestureDetector>

        <Text style={styles.amount}>
          {formatVolume(ml)}
          <Text style={styles.unit}> {VOLUME_UNIT}</Text>
        </Text>
        <Text variant="muted">
          {glass.label} · {tr('до', 'up to')} {formatVolume(capacity)} {VOLUME_UNIT}
        </Text>

        <View style={styles.chips}>
          {GLASS_PRESETS.map((g) => {
            const selected = g === glass;
            return (
              <Pressable
                key={g.ml}
                onPress={() => {
                  if (selected) level.set(withTiming(nominal, { duration: 300 }));
                  else setGlass(g);
                }}
                accessibilityLabel={`${g.label}, ${formatVolume(g.ml)} ${VOLUME_UNIT}`}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.pressed,
                ]}>
                <MaterialCommunityIcons
                  name={g.icon}
                  size={16}
                  color={selected ? colors.accentText : colors.accent}
                />
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {formatVolume(g.ml)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          title={
            editMl != null
              ? tr(
                  `Зберегти ${formatVolume(ml)} ${VOLUME_UNIT}`,
                  `Save ${formatVolume(ml)} ${VOLUME_UNIT}`,
                )
              : tr(
                  `Додати ${formatVolume(ml)} ${VOLUME_UNIT}`,
                  `Add ${formatVolume(ml)} ${VOLUME_UNIT}`,
                )
          }
          icon={editMl != null ? 'checkmark' : 'water'}
          disabled={ml <= 0}
          onPress={() => onAdd(ml)}
        />
      </View>
    </View>
  );
}

const KNOB = 40;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  knob: {
    position: 'absolute',
    top: 0,
    width: KNOB,
    height: KNOB,
    borderRadius: radius.pill,
    backgroundColor: colors.accentGradientEnd,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    marginTop: spacing.lg,
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: '800',
    letterSpacing: -1,
  },
  unit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  chipSelected: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  chipTextSelected: { color: colors.accentText },
  pressed: { opacity: 0.6 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
