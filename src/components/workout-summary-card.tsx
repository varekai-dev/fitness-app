import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import type { listFinishedWorkouts } from '@/db/workouts';
import { formatKcal } from '@/lib/calories';
import { formatShortDate } from '@/lib/labels';
import { formatDuration, workoutDurationMs } from '@/lib/metrics';
import { colors, radius, spacing } from '@/theme';

type FinishedWorkout = Awaited<ReturnType<typeof listFinishedWorkouts>>[number];

export function WorkoutSummaryCard({
  workout,
  kcal,
}: {
  workout: FinishedWorkout;
  /** Estimated energy, omitted when no body weight is known. */
  kcal?: number | null;
}) {
  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = workout.exercises.filter((e) => e.sets.length > 0);
  const minutes = formatDuration(workoutDurationMs(workout, workout.startedAt) / 1000);
  return (
    <Card
      style={styles.card}
      onPress={() => router.push({ pathname: '/workout/[id]', params: { id: workout.id } })}>
      <View style={styles.date}>
        <Text variant="heading" style={styles.dateDay}>
          {new Date(workout.startedAt).getDate()}
        </Text>
        <Text variant="muted" style={styles.dateMonth}>
          {formatShortDate(workout.startedAt).replace(/^\d+\s*/, '')}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="heading" numberOfLines={1}>
          {workout.dayName}
        </Text>
        <Text variant="muted">
          {minutes} · {totalSets} підх. ·{kcal ? ` ${formatKcal(kcal)} ·` : ''}{' '}
          <Text variant="muted" style={styles.accent}>
            {workout.programName}
          </Text>
        </Text>
        {done.length > 0 && (
          <Text variant="muted" numberOfLines={1}>
            {done.map((e) => e.exercise.name).join(' · ')}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  date: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontSize: 20, lineHeight: 22 },
  dateMonth: { fontSize: 11 },
  body: { flex: 1, gap: 2 },
  accent: { color: colors.accent },
});
