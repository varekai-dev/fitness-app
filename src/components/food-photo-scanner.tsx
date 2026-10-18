import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CircleButton, Text } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { colors, fontSize, radius, spacing } from '@/theme';

export type PhotoScan = {
  uri: string;
  /** The recognized description; set once the answer is in. */
  result?: string;
  error?: { message: string; settings: boolean };
};

// Each stage stays this long; the last one waits for the answer.
const STAGE_MS = 1400;
// Once the answer is in, the remaining stages tick off this fast.
const FINISH_STAGE_MS = 220;
// The found dishes stay on screen this long before the field takes them.
const RESULT_HOLD_MS = 1600;
// A new detection marker pops up this often, and each lives this long.
const MARKER_EVERY_MS = 650;
const MARKER_LIFE_MS = 2000;
const MAX_MARKERS = 4;
const SWEEP_MS = 2200;
const GRID = 44;

const stages = () => [
  tr('Шукаю страви на фото', 'Finding dishes in the photo'),
  tr('Розпізнаю інгредієнти', 'Recognizing ingredients'),
  tr('Оцінюю розмір порцій', 'Estimating portion sizes'),
  tr('Рахую вагу', 'Working out the weight'),
  tr('Складаю опис', 'Writing it up'),
];

const markerLabels = () => [
  tr('текстура', 'texture'),
  tr('колір', 'color'),
  tr('форма', 'shape'),
  tr('об’єм', 'volume'),
  tr('порція', 'portion'),
  tr('білки', 'protein'),
  tr('жири', 'fat'),
  tr('вуглеводи', 'carbs'),
  tr('соус', 'sauce'),
  tr('гарнір', 'side'),
];

/**
 * Full-screen wait while AI looks at a food photo: the photo under a sweeping
 * scan line, a grid, detection markers popping up and a checklist of stages.
 * The stages are paced by time, since the request gives no progress of its
 * own; once `scan.result` is in, the rest tick off, the found dishes show up
 * and `onFinish` hands them over. A failure stays on screen until closed.
 */
export function FoodPhotoScanner({
  scan,
  onFinish,
  onClose,
  onSettings,
}: {
  /** `null` keeps the scanner closed. */
  scan: PhotoScan | null;
  onFinish: () => void;
  onClose: () => void;
  /** Opens the AI key settings, offered when the key is missing or wrong. */
  onSettings: () => void;
}) {
  // Kept while the modal fades away, so it doesn't go blank mid-animation.
  const [shown, setShown] = useState(scan);
  if (scan && scan !== shown) setShown(scan);

  return (
    <Modal
      visible={!!scan}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      {shown && (
        <ScanContent
          key={shown.uri}
          scan={shown}
          onFinish={onFinish}
          onClose={onClose}
          onSettings={onSettings}
        />
      )}
    </Modal>
  );
}

function ScanContent({
  scan,
  onFinish,
  onClose,
  onSettings,
}: {
  scan: PhotoScan;
  onFinish: () => void;
  onClose: () => void;
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  const steps = stages();
  const last = steps.length - 1;
  const [stage, setStage] = useState(0);
  const done = scan.result !== undefined;
  const failed = !!scan.error;
  // Past the last stage means everything is ticked off.
  const finished = stage > last;

  useEffect(() => {
    if (failed) return;
    if (finished) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const timer = setTimeout(onFinish, RESULT_HOLD_MS);
      return () => clearTimeout(timer);
    }
    // The last stage waits for the answer.
    if (stage === last && !done) return;
    const timer = setTimeout(
      () => {
        Haptics.selectionAsync();
        setStage(stage + 1);
      },
      done ? FINISH_STAGE_MS : STAGE_MS,
    );
    return () => clearTimeout(timer);
  }, [stage, last, done, failed, finished, onFinish]);

  useEffect(() => {
    if (failed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [failed]);

  const scanning = !finished && !failed;
  const dishes = scan.result?.split(', ') ?? [];

  return (
    <View style={styles.root}>
      <Image source={{ uri: scan.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, failed ? styles.dimFailed : styles.dim]} />

      {scanning && (
        <Animated.View style={StyleSheet.absoluteFill} exiting={FadeOut.duration(300)}>
          <Grid />
          <Markers />
          <Sweep />
        </Animated.View>
      )}
      {finished && <Flash />}

      <Viewfinder
        top={insets.top + 72}
        bottom={insets.bottom + 300}
        state={failed ? 'failed' : finished ? 'done' : 'scanning'}
      />

      <View style={[styles.close, { top: insets.top + spacing.md }]}>
        <CircleButton icon="close" onPress={onClose} background="rgba(0, 0, 0, 0.45)" />
      </View>
      <View style={[styles.badge, { top: insets.top + spacing.md + 8 }]}>
        <Blink active={scanning} />
        <Text variant="secondary" style={styles.badgeText}>
          {failed
            ? tr('Помилка', 'Error')
            : finished
              ? tr('Готово', 'Done')
              : tr('AI сканує', 'AI scanning')}
        </Text>
      </View>

      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.85)', colors.background]}
        locations={[0, 0.35, 1]}
        style={[styles.panel, { paddingBottom: insets.bottom + spacing.xl }]}>
        {failed ? (
          <Animated.View entering={FadeInDown} style={styles.gap}>
            <Row icon="alert-circle" color={colors.danger}>
              <Text variant="title">{tr('Не вдалося розпізнати', 'Couldn’t recognize')}</Text>
            </Row>
            <Text variant="secondary">{scan.error!.message}</Text>
            <View style={styles.buttons}>
              {scan.error!.settings && (
                <Button
                  title={tr('Налаштування', 'Settings')}
                  variant="secondary"
                  onPress={onSettings}
                  style={styles.flex}
                />
              )}
              <Button title={tr('Закрити', 'Close')} onPress={onClose} style={styles.flex} />
            </View>
          </Animated.View>
        ) : finished ? (
          <View style={styles.gap}>
            <Animated.View entering={FadeInDown.duration(300)}>
              <Row icon="checkmark-circle" color={colors.accent}>
                <Text variant="title">{tr('Ось що на тарілці', 'Here’s what’s on the plate')}</Text>
              </Row>
            </Animated.View>
            <View style={styles.chips}>
              {dishes.map((d, i) => (
                <Animated.View
                  key={`${i}-${d}`}
                  entering={ZoomIn.delay(150 + i * 140).springify()}
                  style={styles.chip}>
                  <Ionicons name="restaurant" size={14} color={colors.accentText} />
                  <Text variant="secondary" style={styles.chipText}>
                    {d}
                  </Text>
                </Animated.View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.gap}>
            {/* Titles overlap while one leaves and the next comes in, so they don't push each other. */}
            <View style={styles.titleBox}>
              <Animated.View
                key={stage}
                entering={FadeInDown.duration(300)}
                exiting={FadeOutUp.duration(180)}
                style={styles.slide}>
                <Text variant="title" numberOfLines={1}>
                  {`${steps[stage]}…`}
                </Text>
              </Animated.View>
            </View>
            <Progress done={done} />
            <View style={styles.steps}>
              {steps.map((s, i) => (
                <Step
                  key={s}
                  title={s}
                  state={i < stage ? 'done' : i === stage ? 'active' : 'todo'}
                />
              ))}
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

function Row({
  icon,
  color,
  children,
}: {
  icon: 'alert-circle' | 'checkmark-circle';
  color: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={26} color={color} />
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

function Step({ title, state }: { title: string; state: 'done' | 'active' | 'todo' }) {
  return (
    <View style={styles.row}>
      <View style={styles.stepIcon}>
        {state === 'active' ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Ionicons
            name={state === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={state === 'done' ? colors.accent : colors.textMuted}
          />
        )}
      </View>
      <Text
        variant="secondary"
        style={[state === 'todo' && styles.todo, state === 'active' && styles.active]}>
        {title}
      </Text>
    </View>
  );
}

/** A glowing line sweeping down the photo with a fading trail behind it. */
function Sweep() {
  const { height } = useWindowDimensions();
  const y = useSharedValue(0);

  useEffect(() => {
    y.set(
      withRepeat(
        withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [y]);

  // The trail follows the line, above it on the way down and below on the way up.
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() * height }] }));

  return (
    <Animated.View style={[styles.sweep, line]} pointerEvents="none">
      <LinearGradient
        colors={['transparent', 'rgba(234, 244, 107, 0.28)']}
        style={styles.trailUp}
      />
      <View style={styles.line} />
      <LinearGradient
        colors={['rgba(234, 244, 107, 0.28)', 'transparent']}
        style={styles.trailDown}
      />
    </Animated.View>
  );
}

/** A faint grid breathing over the photo. */
function Grid() {
  const { width, height } = useWindowDimensions();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1600 }), -1, true));
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.get() * 0.4 }));
  const cols = Math.ceil(width / GRID);
  const rows = Math.ceil(height / GRID);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {Array.from({ length: cols }, (_, i) => (
        <View key={`c${i}`} style={[styles.gridCol, { left: i * GRID }]} />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <View key={`r${i}`} style={[styles.gridRow, { top: i * GRID }]} />
      ))}
    </Animated.View>
  );
}

type Marker = { id: number; x: number; y: number; label: string; score: number };

/** Detection markers popping up around the middle of the photo, each with a label and a score. */
function Markers() {
  const { width, height } = useWindowDimensions();
  const [markers, setMarkers] = useState<Marker[]>([]);
  const next = useRef(0);

  useEffect(() => {
    const labels = markerLabels();
    const timer = setInterval(() => {
      const id = next.current++;
      const marker: Marker = {
        id,
        // Inside the viewfinder, clear of the edges and the panel.
        x: width * (0.15 + Math.random() * 0.55),
        y: height * (0.18 + Math.random() * 0.38),
        label: labels[id % labels.length],
        score: 0.72 + Math.random() * 0.27,
      };
      setMarkers((m) => [...m.slice(-(MAX_MARKERS - 1)), marker]);
      setTimeout(() => setMarkers((m) => m.filter((x) => x.id !== id)), MARKER_LIFE_MS);
    }, MARKER_EVERY_MS);
    return () => clearInterval(timer);
  }, [width, height]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {markers.map((m) => (
        <Animated.View
          key={m.id}
          entering={ZoomIn.duration(250)}
          exiting={FadeOut.duration(250)}
          style={[styles.marker, { left: m.x, top: m.y }]}>
          <Ping />
          <View style={styles.tag}>
            <Text variant="muted" style={styles.tagText}>
              {`${m.label} ${Math.round(m.score * 100)}%`}
            </Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

/** A dot with a ring spreading out of it. */
function Ping() {
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1));
  }, [t]);

  const ring = useAnimatedStyle(() => ({
    opacity: 1 - t.get(),
    transform: [{ scale: 0.4 + t.get() * 1.6 }],
  }));

  return (
    <View style={styles.ping}>
      <Animated.View style={[styles.pingRing, ring]} />
      <View style={styles.pingDot} />
    </View>
  );
}

/** Corner brackets framing the photo; they breathe while scanning and lock on when done. */
function Viewfinder({
  top,
  bottom,
  state,
}: {
  top: number;
  bottom: number;
  state: 'scanning' | 'done' | 'failed';
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.set(
      state === 'scanning'
        ? withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true)
        : withTiming(0, { duration: 250 }),
    );
  }, [pulse, state]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - pulse.get() * 0.03 }] }));
  const color =
    state === 'failed' ? colors.danger : state === 'done' ? colors.success : colors.accent;

  return (
    <Animated.View style={[styles.finder, { top, bottom }, style]} pointerEvents="none">
      <View style={[styles.corner, styles.tl, { borderColor: color }]} />
      <View style={[styles.corner, styles.tr, { borderColor: color }]} />
      <View style={[styles.corner, styles.bl, { borderColor: color }]} />
      <View style={[styles.corner, styles.br, { borderColor: color }]} />
    </Animated.View>
  );
}

/** A quick accent flash over the photo when the scan completes. */
function Flash() {
  const o = useSharedValue(0);

  useEffect(() => {
    o.set(withSequence(withTiming(0.45, { duration: 120 }), withTiming(0, { duration: 500 })));
  }, [o]);

  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.flash, style]} pointerEvents="none" />
  );
}

/** A blinking dot, like a recording light; steady when idle. */
function Blink({ active }: { active: boolean }) {
  const o = useSharedValue(1);

  useEffect(() => {
    o.set(
      active
        ? withRepeat(
            withSequence(withTiming(0.2, { duration: 500 }), withTiming(1, { duration: 500 })),
            -1,
          )
        : withTiming(1),
    );
  }, [o, active]);

  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View entering={FadeIn} style={[styles.blink, style]} />;
}

/** Creeps towards the end without reaching it, since the wait's length is unknown; fills up when done. */
function Progress({ done }: { done: boolean }) {
  const progress = useSharedValue(0.03);

  useEffect(() => {
    progress.set(
      done
        ? withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })
        : withDelay(100, withTiming(0.92, { duration: 12000, easing: Easing.out(Easing.cubic) })),
    );
  }, [progress, done]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, fill]} />
    </View>
  );
}

const CORNER = 34;
const LINE = 3;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  dimFailed: { backgroundColor: 'rgba(40, 0, 0, 0.55)' },
  close: { position: 'absolute', right: spacing.lg },
  badge: {
    position: 'absolute',
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  badgeText: { color: colors.text, fontWeight: '600' },
  blink: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  sweep: { position: 'absolute', left: 0, right: 0, top: 0, height: 0 },
  line: {
    height: LINE,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  trailUp: { position: 'absolute', left: 0, right: 0, bottom: LINE, height: 90 },
  trailDown: { position: 'absolute', left: 0, right: 0, top: LINE, height: 90 },
  gridCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(234, 244, 107, 0.18)',
  },
  gridRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(234, 244, 107, 0.18)',
  },
  marker: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ping: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pingRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  pingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  tagText: { color: colors.accent, fontSize: fontSize.xs },
  finder: { position: 'absolute', left: spacing.xl, right: spacing.xl },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: LINE,
    borderLeftWidth: LINE,
    borderTopLeftRadius: radius.md,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: LINE,
    borderRightWidth: LINE,
    borderTopRightRadius: radius.md,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: LINE,
    borderLeftWidth: LINE,
    borderBottomLeftRadius: radius.md,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: LINE,
    borderRightWidth: LINE,
    borderBottomRightRadius: radius.md,
  },
  flash: { backgroundColor: colors.accent },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl * 2,
  },
  gap: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleBox: { height: fontSize.xxl + 10 },
  slide: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
  bar: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  steps: { gap: spacing.sm },
  stepIcon: { width: 20, alignItems: 'center' },
  todo: { color: colors.textMuted },
  active: { color: colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  chipText: { color: colors.accentText, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
