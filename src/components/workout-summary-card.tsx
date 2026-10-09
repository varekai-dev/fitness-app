import { router } from 'expo-router';

import { Card, Row, Text } from '@/components/ui';
import type { listFinishedWorkouts } from '@/db/workouts';
import { formatDate } from '@/lib/labels';
import { formatDuration } from '@/lib/metrics';

type FinishedWorkout = Awaited<ReturnType<typeof listFinishedWorkouts>>[number];

export function WorkoutSummaryCard({ workout }: { workout: FinishedWorkout }) {
  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = workout.exercises.filter((e) => e.sets.length > 0);
  return (
    <Card onPress={() => router.push({ pathname: '/workout/[id]', params: { id: workout.id } })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading">{workout.dayName}</Text>
        <Text variant="caption">{formatDate(workout.startedAt)}</Text>
      </Row>
      <Text variant="caption">
        {workout.programName} · {formatDuration(((workout.finishedAt ?? workout.startedAt) - workout.startedAt) / 1000)} ·{' '}
        {totalSets} підх.
      </Text>
      {done.length > 0 && (
        <Text variant="muted" numberOfLines={2}>
          {done.map((e) => e.exercise.name).join(' · ')}
        </Text>
      )}
    </Card>
  );
}
