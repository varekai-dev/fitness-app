import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { MuscleIcon } from '@/components/muscle-icon';
import { TargetsEditor } from '@/components/targets-editor';
import {
  Button,
  Card,
  CircleButton,
  EmptyState,
  Field,
  goBack,
  IconButton,
  IndexMarker,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import {
  deleteDay,
  getProgramDay,
  moveDayExercise,
  removeDayExercise,
  renameDay,
  updateDayExercise,
} from '@/db/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { tr } from '@/lib/i18n';
import { colors, spacing } from '@/theme';

export default function ProgramDayScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data: day } = useDbQuery(() => getProgramDay(id).then((d) => d ?? null), [id]);
  const dialog = useDialog();

  if (day === undefined) return <Loading />;
  if (day === null) {
    return (
      <Screen title={tr('День', 'Day')}>
        <EmptyState icon="alert-circle" title={tr('День не знайдено', 'Day not found')} />
      </Screen>
    );
  }

  const remove = () =>
    dialog.show({
      title: tr('Видалити день?', 'Delete day?'),
      message: tr(
        'Минулі тренування цього дня залишаться в історії.',
        'Past workouts of this day stay in the history.',
      ),
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        {
          text: tr('Видалити', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteDay(id);
            goBack();
          },
        },
      ],
    });

  return (
    <Screen
      title={day.name}
      headerRight={<CircleButton icon="trash-outline" color={colors.danger} onPress={remove} />}>
      <Text variant="overline">{day.program.name}</Text>
      <DayNameField key={day.name} id={id} name={day.name} />

      <SectionHeader
        title={`${tr('Послідовність вправ', 'Exercise order')} · ${day.exercises.length}`}
      />
      {day.exercises.length === 0 && (
        <EmptyState
          icon="barbell"
          title={tr('Додай вправи в цей день', 'Add exercises to this day')}
        />
      )}
      {day.exercises.map((e, i) => (
        <Card key={e.id} style={styles.card}>
          <Row>
            <IndexMarker n={i + 1} />
            <ExerciseThumb uri={e.exercise.imageUri} size={44} />
            <Text variant="body" style={styles.flex} numberOfLines={2}>
              {e.exercise.name}
            </Text>
            <MuscleIcon group={e.exercise.muscleGroup} size={36} />
            <IconButton
              icon="chevron-up"
              size={18}
              disabled={i === 0}
              onPress={() => moveDayExercise(id, e.id, -1)}
            />
            <IconButton
              icon="chevron-down"
              size={18}
              disabled={i === day.exercises.length - 1}
              onPress={() => moveDayExercise(id, e.id, 1)}
            />
            <IconButton
              icon="close-circle"
              size={20}
              color={colors.textMuted}
              onPress={() => removeDayExercise(e.id)}
            />
          </Row>
          <TargetsEditor
            type={e.exercise.trackingType}
            targets={e}
            onSave={(t) => updateDayExercise(e.id, t)}
          />
        </Card>
      ))}

      <Button
        title={tr('Додати вправу', 'Add exercise')}
        icon="add"
        onPress={() => router.push({ pathname: '/pick-exercise', params: { dayId: id } })}
      />
      {dialog.element}
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
  return (
    <Field
      label={tr('Назва дня', 'Day name')}
      value={value}
      onChangeText={setValue}
      onEndEditing={save}
      returnKeyType="done"
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md },
});
