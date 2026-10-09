import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui';
import { formatDuration } from '@/lib/metrics';
import { colors, fontSize, radius, spacing } from '@/theme';

const SIZE = 132;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Bottom sheet with a ring countdown shown between sets. */
export function RestTimerCard({
  remainingSec,
  totalSec,
  label,
  bottomInset,
  onExtend,
  onSkip,
}: {
  remainingSec: number;
  totalSec: number;
  label: string;
  bottomInset: number;
  onExtend: () => void;
  onSkip: () => void;
}) {
  const progress = totalSec > 0 ? remainingSec / totalSec : 0;
  return (
    <View style={[styles.sheet, { paddingBottom: bottomInset + spacing.lg }]}>
      <View style={styles.handle} />
      <Text variant="overline">Відпочинок</Text>
      <Text variant="heading" numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.controls}>
        <Pressable style={styles.side} onPress={onExtend}>
          <Text variant="body">+15 с</Text>
        </Pressable>
        <View style={styles.ring}>
          <Svg width={SIZE} height={SIZE} style={styles.svg}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={colors.surfaceRaised}
              strokeWidth={STROKE}
              fill="none"
            />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={colors.accent}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            />
          </Svg>
          <Text variant="title" style={styles.time}>
            {formatDuration(remainingSec)}
          </Text>
          <Text variant="muted" style={styles.remaining}>
            ЗАЛИШИЛОСЬ
          </Text>
        </View>
        <Pressable style={[styles.side, styles.skip]} onPress={onSkip}>
          <Ionicons name="play-skip-forward" size={20} color={colors.accentText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  ring: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  time: { fontSize: fontSize.xxl + 6 },
  remaining: { fontSize: 9, letterSpacing: 1 },
  side: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skip: { backgroundColor: colors.accent },
});
