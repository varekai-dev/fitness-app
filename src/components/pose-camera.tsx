import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { OUTLINES } from '@/components/pose-outlines';
import { Button, CircleButton, Text } from '@/components/ui';
import type { PhotoPose } from '@/db/schema';
import { readSettingSync, writeSettingSync } from '@/lib/app-settings';
import { tr } from '@/lib/i18n';
import { SEXES, type Sex } from '@/lib/profile';
import { POSE_LABELS } from '@/lib/progress-photos';
import { colors, radius, spacing } from '@/theme';

/** Self-timer steps the timer button cycles through, in seconds. */
const TIMERS = [0, 3, 10] as const;

/**
 * Where the outline sits in the frame: its size (1 fits a full-height person)
 * and how far it is moved down, as a share of the frame height. One for all
 * poses, since the phone stays in the same spot for each of them. `mirrored`
 * turns the side outline to face the other way.
 */
type Guide = { visible: boolean; scale: number; y: number; mirrored: boolean };

const GUIDE_KEY = 'progressPhotoGuide';
const DEFAULT_GUIDE: Guide = { visible: true, scale: 1, y: 0, mirrored: false };
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const MAX_Y = 1;

function readGuide(): Guide {
  try {
    return { ...DEFAULT_GUIDE, ...JSON.parse(readSettingSync(GUIDE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_GUIDE;
  }
}

const saveGuide = (guide: Guide) => writeSettingSync(GUIDE_KEY, JSON.stringify(guide));

/** The outline follows the sex in the profile; a man's when it isn't set. */
function readSex(): Sex {
  const sex = readSettingSync('profile_sex');
  return SEXES.find((s) => s === sex) ?? 'male';
}

const clamp = (v: number, min: number, max: number) => {
  'worklet';
  return Math.min(Math.max(v, min), max);
};

const poseHints = (): Record<PhotoPose, string> => ({
  front: tr(
    'Стань обличчям до камери в силует: ноги на ширині плечей, руки трохи від тіла.',
    'Face the camera inside the outline: feet shoulder-width apart, arms slightly out.',
  ),
  side: tr(
    'Стань боком у силует, руки вздовж тіла, дивись прямо.',
    'Stand side-on inside the outline, arms down, looking straight ahead.',
  ),
  back: tr(
    'Стань спиною до камери в силует: ноги на ширині плечей, руки трохи від тіла.',
    'Turn your back to the camera inside the outline: feet shoulder-width apart, arms slightly out.',
  ),
});

/**
 * Full-screen camera for progress photos with the outline of a person in the
 * chosen pose over the preview, so every photo is taken from the same spot and
 * the comparison lines up. Pinching resizes the outline and dragging moves it
 * up or down, always centered; it stays that way for the next photo. A
 * self-timer lets the phone stand on a shelf. `onTaken` gets the temporary uri
 * of the 3:4 photo.
 */
export function PoseCamera({
  pose,
  visible,
  onTaken,
  onClose,
}: {
  pose: PhotoPose;
  visible: boolean;
  onTaken: (uri: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      {/* A modal is outside the app's root view, so gestures need their own. */}
      <GestureHandlerRootView style={styles.root}>
        {visible && <CameraContent pose={pose} onTaken={onTaken} onClose={onClose} />}
      </GestureHandlerRootView>
    </Modal>
  );
}

function CameraContent({
  pose,
  onTaken,
  onClose,
}: {
  pose: PhotoPose;
  onTaken: (uri: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(0);
  const [ready, setReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(readGuide);
  const [sex] = useState(readSex);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    if (countdown === null) return;
    const t = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
        return;
      }
      setCountdown(null);
      shoot();
    }, 1000);
    return () => clearTimeout(t);
    // `shoot` only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  async function shoot() {
    setBusy(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (photo) {
        onTaken(photo.uri);
      }
    } finally {
      setBusy(false);
    }
  }

  const press = () => {
    if (countdown !== null) {
      setCountdown(null);
      return;
    }
    if (timer > 0) setCountdown(timer);
    else shoot();
  };

  const updateGuide = (next: Guide) => {
    setGuide(next);
    saveGuide(next);
  };

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.denied, { paddingTop: insets.top }]}>
        <Text variant="title" style={styles.center}>
          {tr('Немає доступу до камери', 'No access to the camera')}
        </Text>
        <Text variant="muted" style={styles.center}>
          {tr(
            'Дозволь доступ до камери, щоб фотографувати прогрес.',
            'Allow camera access to take progress photos.',
          )}
        </Text>
        <Button
          title={tr('Дозволити', 'Allow')}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        />
        <Button title={tr('Закрити', 'Close')} variant="secondary" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.frame, { marginTop: insets.top + 64 }]}>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          ratio="4:3"
          onCameraReady={() => setReady(true)}
        />
        <PoseOutline pose={pose} sex={sex} guide={guide} onChange={updateGuide} />
        {countdown !== null && (
          <View style={styles.countdownBox} pointerEvents="none">
            <Animated.Text key={countdown} entering={ZoomIn.duration(250)} style={styles.countdown}>
              {countdown}
            </Animated.Text>
          </View>
        )}
      </View>

      <View style={[styles.header, { top: insets.top + spacing.md }]}>
        <View style={styles.pill}>
          <Text variant="secondary" style={styles.pillText}>
            {POSE_LABELS[pose]}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          {pose === 'side' && guide.visible && (
            <CircleButton
              icon="swap-horizontal"
              color={guide.mirrored ? colors.accent : colors.text}
              onPress={() => {
                updateGuide({ ...guide, mirrored: !guide.mirrored });
              }}
              background="rgba(0, 0, 0, 0.45)"
            />
          )}
          <CircleButton
            icon={guide.visible ? 'body' : 'body-outline'}
            color={guide.visible ? colors.accent : colors.text}
            onPress={() => {
              updateGuide({ ...guide, visible: !guide.visible });
            }}
            background="rgba(0, 0, 0, 0.45)"
          />
          <CircleButton icon="close" onPress={onClose} background="rgba(0, 0, 0, 0.45)" />
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Animated.View key={pose} entering={FadeIn} style={styles.hints}>
          <Text variant="secondary" style={styles.center}>
            {poseHints()[pose]}
          </Text>
          {guide.visible && (
            <Text variant="muted" style={styles.center}>
              {tr(
                'Зведи чи розведи пальці, щоб змінити розмір силуету, тягни, щоб зсунути. Подвійний дотик скидає.',
                'Pinch to resize the outline, drag to move it. Double-tap to reset.',
              )}
            </Text>
          )}
        </Animated.View>
        <View style={styles.controls}>
          <Pressable
            onPress={() => {
              setTimer(TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]);
            }}
            disabled={countdown !== null}
            hitSlop={8}
            style={styles.side}>
            <View style={[styles.timer, timer > 0 && styles.timerOn]}>
              <Text variant="secondary" style={[styles.timerText, timer > 0 && styles.timerTextOn]}>
                {timer > 0 ? `${timer} ${tr('с', 's')}` : tr('Таймер', 'Timer')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={press}
            disabled={!ready || busy}
            accessibilityLabel={tr('Зробити фото', 'Take photo')}
            style={({ pressed }) => [styles.shutter, (pressed || !ready || busy) && styles.dim]}>
            <View style={[styles.shutterInner, countdown !== null && styles.shutterStop]} />
          </Pressable>
          <View style={styles.side}>
            <CircleButton
              icon="camera-reverse-outline"
              onPress={() => {
                setReady(false);
                setFacing(facing === 'back' ? 'front' : 'back');
              }}
              disabled={countdown !== null}
              background="rgba(255, 255, 255, 0.12)"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const OUTLINE = {
  stroke: colors.accent,
  strokeLinejoin: 'round' as const,
  fill: 'rgba(234, 244, 107, 0.10)',
};

/**
 * The outline of a person in the pose over the camera preview, on the center
 * line of the frame. Pinching resizes it and dragging moves it up or down; it
 * never moves sideways, so the person stays centered.
 */
function PoseOutline({
  pose,
  sex,
  guide,
  onChange,
}: {
  pose: PhotoPose;
  sex: Sex;
  guide: Guide;
  onChange: (guide: Guide) => void;
}) {
  const [height, setHeight] = useState(0);
  const scale = useSharedValue(guide.scale);
  const y = useSharedValue(guide.y);
  const startScale = useSharedValue(guide.scale);
  const startY = useSharedValue(guide.y);

  const commit = (s: number, dy: number) => onChange({ ...guide, scale: s, y: dy });

  const pinch = Gesture.Pinch()
    .enabled(guide.visible)
    .onStart(() => startScale.set(scale.get()))
    .onUpdate((e) => scale.set(clamp(startScale.get() * e.scale, MIN_SCALE, MAX_SCALE)))
    .onEnd(() => scheduleOnRN(commit, scale.get(), y.get()));
  const pan = Gesture.Pan()
    .enabled(guide.visible)
    .onStart(() => startY.set(y.get()))
    .onUpdate((e) => {
      if (height > 0) y.set(clamp(startY.get() + e.translationY / height, -MAX_Y, MAX_Y));
    })
    .onEnd(() => scheduleOnRN(commit, scale.get(), y.get()));
  const reset = Gesture.Tap()
    .enabled(guide.visible)
    .numberOfTaps(2)
    .onEnd(() => {
      scale.set(withTiming(1));
      y.set(withTiming(0));
      scheduleOnRN(commit, 1, 0);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() * height }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, reset)}>
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {guide.visible && (
          <Animated.View
            style={StyleSheet.absoluteFill}
            entering={FadeIn}
            exiting={FadeOut}
            pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill}>
              <Line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255, 255, 255, 0.25)" />
            </Svg>
            <Animated.View style={[StyleSheet.absoluteFill, style]}>
              <Svg
                viewBox="0 0 300 400"
                style={[
                  StyleSheet.absoluteFill,
                  pose === 'side' && guide.mirrored && styles.mirrored,
                ]}>
                {OUTLINES[sex][pose].map((d) => (
                  // About the same line width however far the outline is scaled.
                  <Path key={d} d={d} {...OUTLINE} strokeWidth={2.5 / guide.scale} />
                ))}
              </Svg>
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  denied: { justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  center: { textAlign: 'center' },
  frame: {
    width: '100%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: '#111',
  },
  header: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  pillText: { color: colors.text, fontWeight: '600' },
  countdownBox: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  countdown: {
    color: colors.accent,
    fontSize: 120,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 16,
  },
  bottom: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  hints: { gap: spacing.xs },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: 88, alignItems: 'center' },
  timer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  timerOn: { backgroundColor: colors.accent },
  timerText: { color: colors.text, fontWeight: '600' },
  timerTextOn: { color: colors.accentText },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.text },
  shutterStop: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.danger },
  dim: { opacity: 0.6 },
  mirrored: { transform: [{ scaleX: -1 }] },
});
