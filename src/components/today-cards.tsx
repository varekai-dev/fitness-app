import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Card, Text, type IconName } from '@/components/ui';
import { drinkWater } from '@/components/water-card';
import { formatKcal } from '@/lib/food';
import { formatLiters } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

const RING = 56;
const STROKE = 6;
const R = (RING - STROKE) / 2;
const LENGTH = 2 * Math.PI * R;
const QUICK_WATER_ML = 250;

/** Static progress arc; turns warning-coloured past 100% when `overIsBad`. */
function ProgressRing({
  progress,
  icon,
  overIsBad,
}: {
  progress: number;
  icon: IconName;
  overIsBad?: boolean;
}) {
  const over = overIsBad && progress > 1;
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} style={styles.ringSvg}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={R}
          stroke={colors.surfaceRaised}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={R}
          stroke={over ? colors.warning : colors.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - Math.min(Math.max(progress, 0), 1))}
          fill="none"
        />
      </Svg>
      <Ionicons name={icon} size={20} color={over ? colors.warning : colors.accent} />
    </View>
  );
}

function TodayCard({
  title,
  ring,
  value,
  goal,
  action,
  onPress,
}: {
  title: string;
  ring: ReactNode;
  value: string;
  goal: string;
  action: ReactNode;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.top}>
        {ring}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
      <Text variant="caption">{title}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      <Text variant="muted" numberOfLines={1}>
        {goal}
      </Text>
      {action}
    </Card>
  );
}

function QuickButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.quick, pressed && styles.quickPressed]}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text variant="body" style={styles.quickText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Home screen "today" row: calories and water side by side with one-tap actions. */
export function TodayCards({
  kcal,
  kcalGoal,
  waterMl,
  waterGoal,
}: {
  kcal: number;
  kcalGoal: number;
  waterMl: number;
  waterGoal: number;
}) {
  return (
    <View style={styles.row}>
      <TodayCard
        title="Калорії"
        ring={<ProgressRing progress={kcal / kcalGoal} icon="restaurant" overIsBad />}
        value={`${formatKcal(kcal)} ккал`}
        goal={`з ${formatKcal(kcalGoal)}`}
        onPress={() => router.navigate('/food')}
        action={<QuickButton label="Їжа" icon="add" onPress={() => router.navigate('/food')} />}
      />
      <TodayCard
        title="Вода"
        ring={<ProgressRing progress={waterMl / waterGoal} icon="water" />}
        value={formatLiters(waterMl)}
        goal={`з ${formatLiters(waterGoal)}`}
        onPress={() => router.navigate('/water')}
        action={
          <QuickButton
            label={`${QUICK_WATER_ML} мл`}
            icon="add"
            onPress={() => drinkWater(QUICK_WATER_ML, waterMl, waterGoal)}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  card: { flex: 1, gap: 2 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  value: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  quickPressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  quickText: { color: colors.accent, fontWeight: '700' },
});
