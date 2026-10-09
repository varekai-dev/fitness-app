import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Field, IconButton, Loading, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { addDay, getProgram, moveDay, removeProgram, renameProgram, setActiveProgram } from '@/db/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, spacing } from '@/theme';

export default function ProgramScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data: program } = useDbQuery(() => getProgram(id).then((p) => p ?? null), [id]);
  const [dayName, setDayName] = useState('');

  if (program === undefined) return <Loading />;
  if (program === null) return <EmptyState icon="alert-circle" title="Програму не знайдено" />;

  const createDay = async () => {
    const trimmed = dayName.trim() || `День ${program.days.length + 1}`;
    await addDay(id, trimmed);
    setDayName('');
  };

  const remove = () =>
    Alert.alert('Видалити програму?', 'Якщо за нею вже були тренування, програма піде в архів, а історія залишиться.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          const result = await removeProgram(id);
          if (result === 'workout_in_progress') {
            Alert.alert('Неможливо', 'Спершу заверши або скасуй поточне тренування за цією програмою.');
            return;
          }
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: program.name }} />
      <ProgramNameField key={program.name} id={id} name={program.name} />

      {program.isActive ? (
        <Text variant="caption" style={{ color: colors.accent }}>
          Активна програма
        </Text>
      ) : (
        <Button
          title="Зробити активною"
          variant="secondary"
          icon="checkmark-circle-outline"
          onPress={() => setActiveProgram(id)}
        />
      )}

      <SectionHeader title="Дні" />
      {program.days.length === 0 && <EmptyState icon="calendar" title="Додай перший день" />}
      {program.days.map((d, i) => (
        <Card
          key={d.id}
          style={styles.day}
          onPress={() => router.push({ pathname: '/program/day/[id]', params: { id: d.id } })}>
          <View style={styles.flex}>
            <Text variant="heading">
              {i + 1}. {d.name}
            </Text>
            <Text variant="caption" numberOfLines={2}>
              {d.exercises.length === 0 ? 'Без вправ' : d.exercises.map((e) => e.exercise.name).join(' · ')}
            </Text>
          </View>
          <IconButton icon="chevron-up" disabled={i === 0} onPress={() => moveDay(id, d.id, -1)} />
          <IconButton icon="chevron-down" disabled={i === program.days.length - 1} onPress={() => moveDay(id, d.id, 1)} />
        </Card>
      ))}
      <Row>
        <Field
          containerStyle={styles.flex}
          value={dayName}
          onChangeText={setDayName}
          placeholder={`День ${program.days.length + 1}`}
          onSubmitEditing={createDay}
          returnKeyType="done"
        />
        <Button title="Додати день" icon="add" variant="secondary" onPress={createDay} />
      </Row>

      <Button title="Видалити програму" variant="danger" icon="trash-outline" onPress={remove} />
    </Screen>
  );
}

function ProgramNameField({ id, name }: { id: number; name: string }) {
  const [value, setValue] = useState(name);
  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) renameProgram(id, trimmed);
    else setValue(name);
  };
  return <Field label="Назва" value={value} onChangeText={setValue} onEndEditing={save} returnKeyType="done" />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  day: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
