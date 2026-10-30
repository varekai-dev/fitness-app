import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ExerciseThumb } from '@/components/exercise-thumb';
import { MuscleIcon } from '@/components/muscle-icon';
import {
  Button,
  Card,
  EmptyState,
  goBack,
  Loading,
  ScreenHeader,
  SearchField,
  Text,
} from '@/components/ui';
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
    goBack();
  };

  return (
    <View style={styles.list}>
      <ScreenHeader mode="modal" title={t`Додати вправу`} />
      <FlatList
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        data={filtered}
        keyExtractor={(e) => String(e.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchField
              placeholder={t`Пошук вправ…`}
              value={search}
              onChangeText={setSearch}
            />
            <Button
              title={t`Створити нову вправу`}
              icon="add"
              variant="ghost"
              onPress={() => router.push('/exercise/edit')}
            />
          </View>
        }
        renderItem={({ item }) => (
          <Card onPress={() => pick(item.id)} style={styles.item}>
            <ExerciseThumb uri={item.imageUri} size={48} />
            <View style={styles.flex}>
              <Text variant="body">{item.name}</Text>
              <Text variant="caption">{MUSCLE_GROUP_LABELS[item.muscleGroup]}</Text>
            </View>
            <MuscleIcon group={item.muscleGroup} size={40} />
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState icon="search" title={t`Нічого не знайдено`} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.lg,
  },
  flex: { flex: 1 },
});
