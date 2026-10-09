import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ExerciseThumb } from '@/components/exercise-thumb';
import { Button, Card, EmptyState, Field, Loading, Text } from '@/components/ui';
import { listExercises } from '@/db/exercises';
import { addDayExercise } from '@/db/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { MUSCLE_GROUP_LABELS } from '@/lib/labels';
import { colors, spacing } from '@/theme';

export default function PickExerciseScreen() {
  const dayId = Number(useLocalSearchParams<{ dayId: string }>().dayId);
  const { data } = useDbQuery(listExercises);
  const [search, setSearch] = useState('');

  if (!data) return <Loading />;
  const q = search.trim().toLowerCase();
  const filtered = q ? data.filter((e) => e.name.toLowerCase().includes(q)) : data;

  const pick = async (exerciseId: number) => {
    await addDayExercise(dayId, exerciseId);
    router.back();
  };

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={filtered}
      keyExtractor={(e) => String(e.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <Field placeholder="Пошук" value={search} onChangeText={setSearch} autoFocus />
          <Button title="Створити нову вправу" icon="add" variant="ghost" onPress={() => router.push('/exercise/edit')} />
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => pick(item.id)} style={styles.item}>
          <ExerciseThumb uri={item.imageUri} size={36} />
          <View style={styles.flex}>
            <Text variant="body">{item.name}</Text>
            <Text variant="caption">{MUSCLE_GROUP_LABELS[item.muscleGroup]}</Text>
          </View>
        </Card>
      )}
      ListEmptyComponent={<EmptyState icon="search" title="Нічого не знайдено" />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  flex: { flex: 1 },
});
