import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Elapsed } from '@/components/elapsed';
import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import { Button, Card, Chip, EmptyState, Loading, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { getActiveProgram, getNextDayId } from '@/db/programs';
import { getActiveWorkout, listFinishedWorkouts, startWorkout } from '@/db/workouts';
import { useDbQuery } from '@/hooks/use-db-query';
import { prepareRestNotifications } from '@/lib/rest-notifications';
import { spacing } from '@/theme';

async function loadHome() {
  const [activeWorkout, program, recent] = await Promise.all([
    getActiveWorkout(),
    getActiveProgram(),
    listFinishedWorkouts(),
  ]);
  const nextDayId = program ? await getNextDayId(program.id) : null;
  return { activeWorkout, program, nextDayId, recent: recent.slice(0, 3) };
}

export default function HomeScreen() {
  const { data } = useDbQuery(loadHome);
  const [pickedDayId, setPickedDayId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  if (!data) return <Loading />;
  const { activeWorkout, program, nextDayId, recent } = data;
  // A manual pick may point to another program's day after switching programs.
  const selectedDay =
    program?.days.find((d) => d.id === pickedDayId) ?? program?.days.find((d) => d.id === nextDayId);
  const selectedDayId = selectedDay?.id ?? null;

  const start = async () => {
    if (!selectedDay) return;
    setStarting(true);
    try {
      await prepareRestNotifications();
      const id = await startWorkout(selectedDay.id);
      setPickedDayId(null);
      router.push({ pathname: '/workout/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Помилка', (e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen>
      {activeWorkout ? (
        <Card>
          <Row>
            <Text variant="caption">Тренування триває ·</Text>
            <Elapsed since={activeWorkout.startedAt} />
          </Row>
          <Text variant="title">{activeWorkout.dayName}</Text>
          <Text variant="secondary">{activeWorkout.programName}</Text>
          <Button
            title="Продовжити"
            icon="play"
            onPress={() =>
              router.push({ pathname: '/workout/[id]', params: { id: activeWorkout.id } })
            }
          />
        </Card>
      ) : !program ? (
        <Card>
          <EmptyState
            icon="list"
            title="Немає активної програми"
            hint="Створи програму з днями тренувань, щоб почати."
          />
          <Button title="До програм" onPress={() => router.navigate('/programs')} />
        </Card>
      ) : program.days.length === 0 ? (
        <Card>
          <EmptyState icon="calendar" title={`У програмі «${program.name}» ще немає днів`} />
          <Button
            title="Редагувати програму"
            onPress={() => router.push({ pathname: '/program/[id]', params: { id: program.id } })}
          />
        </Card>
      ) : (
        <Card>
          <Text variant="caption">
            {selectedDayId !== nextDayId ? 'Обраний день' : 'Наступне'} · {program.name}
          </Text>
          <Text variant="title">{selectedDay?.name}</Text>
          {program.days.length > 1 && (
            <Row style={styles.days}>
              {program.days.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  selected={d.id === selectedDayId}
                  onPress={() => setPickedDayId(d.id)}
                />
              ))}
            </Row>
          )}
          <Button title="Почати тренування" icon="play" onPress={start} loading={starting} />
        </Card>
      )}

      <SectionHeader
        title="Останні тренування"
        action={
          recent.length > 0 ? (
            <Button title="Усі" variant="ghost" onPress={() => router.navigate('/history')} />
          ) : undefined
        }
      />
      {recent.length === 0 ? (
        <EmptyState icon="time" title="Ще немає завершених тренувань" />
      ) : (
        recent.map((w) => <WorkoutSummaryCard key={w.id} workout={w} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { flexWrap: 'wrap', marginVertical: spacing.sm },
});
