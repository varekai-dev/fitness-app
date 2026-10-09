import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ExerciseThumb } from '@/components/exercise-thumb';
import { Button, Card, Chip, EmptyState, Field, Loading, Row, Text } from '@/components/ui';
import { listExercises } from '@/db/exercises';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { MUSCLE_GROUP_LABELS, TRACKING_TYPE_LABELS } from '@/lib/labels';
import { colors, spacing } from '@/theme';

export default function ExercisesScreen() {
  const { data } = useDbQuery(listExercises);
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [search, setSearch] = useState('');

  if (!data) return <Loading />;
  const q = search.trim().toLowerCase();
  const filtered = data.filter(
    (e) => (!group || e.muscleGroup === group) && (!q || e.name.toLowerCase().includes(q)),
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={filtered}
      keyExtractor={(e) => String(e.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <Button
            title="Нова вправа"
            icon="add"
            variant="secondary"
            onPress={() => router.push('/exercise/edit')}
          />
          <Field placeholder="Пошук" value={search} onChangeText={setSearch} clearButtonMode="while-editing" />
          <Row style={styles.chips}>
            <Chip label="Усі" selected={group === null} onPress={() => setGroup(null)} />
            {MUSCLE_GROUPS.map((g) => (
              <Chip key={g} label={MUSCLE_GROUP_LABELS[g]} selected={g === group} onPress={() => setGroup(g)} />
            ))}
          </Row>
        </View>
      }
      renderItem={({ item }) => (
        <Card
          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
          style={styles.item}>
          <ExerciseThumb uri={item.imageUri} />
          <View style={styles.itemText}>
            <Text variant="heading" numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="caption">
              {MUSCLE_GROUP_LABELS[item.muscleGroup]} · {TRACKING_TYPE_LABELS[item.trackingType]}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      )}
      ListEmptyComponent={<EmptyState icon="barbell" title="Нічого не знайдено" />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  chips: { flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  itemText: { flex: 1, gap: 2 },
});
