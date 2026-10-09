import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ExerciseThumb } from '@/components/exercise-thumb';
import { TargetsEditor } from '@/components/targets-editor';
import { Button, Card, EmptyState, Field, IconButton, Loading, Row, Screen, Text } from '@/components/ui';
import {
  deleteDay,
  getProgramDay,
  moveDayExercise,
  removeDayExercise,
  renameDay,
  updateDayExercise,
} from '@/db/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, spacing } from '@/theme';

export default function ProgramDayScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data: day } = useDbQuery(() => getProgramDay(id).then((d) => d ?? null), [id]);

  if (day === undefined) return <Loading />;
  if (day === null) return <EmptyState icon="alert-circle" title="День не знайдено" />;

  const remove = () =>
    Alert.alert('Видалити день?', 'Минулі тренування цього дня залишаться в історії.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          await deleteDay(id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: day.name }} />
      <Text variant="caption">{day.program.name}</Text>
      <DayNameField key={day.name} id={id} name={day.name} />

      {day.exercises.length === 0 && <EmptyState icon="barbell" title="Додай вправи в цей день" />}
      {day.exercises.map((e, i) => (
        <Card key={e.id}>
          <Row>
            <ExerciseThumb uri={e.exercise.imageUri} size={36} />
            <Text variant="heading" style={styles.flex} numberOfLines={2}>
              {e.exercise.name}
            </Text>
            <IconButton icon="chevron-up" disabled={i === 0} onPress={() => moveDayExercise(id, e.id, -1)} />
            <IconButton
              icon="chevron-down"
              disabled={i === day.exercises.length - 1}
              onPress={() => moveDayExercise(id, e.id, 1)}
            />
            <IconButton icon="close" color={colors.danger} onPress={() => removeDayExercise(e.id)} />
          </Row>
          <TargetsEditor type={e.exercise.trackingType} targets={e} onSave={(t) => updateDayExercise(e.id, t)} />
        </Card>
      ))}

      <Button
        title="Додати вправу"
        icon="add"
        variant="secondary"
        onPress={() => router.push({ pathname: '/pick-exercise', params: { dayId: id } })}
      />
      <View style={styles.spacer} />
      <Button title="Видалити день" variant="danger" icon="trash-outline" onPress={remove} />
    </Screen>
  );
}

function DayNameField({ id, name }: { id: number; name: string }) {
  const [value, setValue] = useState(name);
  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) renameDay(id, trimmed);
    else setValue(name);
  };
  return <Field label="Назва дня" value={value} onChangeText={setValue} onEndEditing={save} returnKeyType="done" />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spacer: { height: spacing.lg },
});
