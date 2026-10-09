import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useTabBarSpace } from '@/components/floating-tab-bar';
import { ExerciseThumb } from '@/components/exercise-thumb';
import {
  Card,
  Chip,
  ChipScroller,
  CircleButton,
  EmptyState,
  Loading,
  ScreenHeader,
  SearchField,
  Text,
} from '@/components/ui';
import { listExercises } from '@/db/exercises';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { MUSCLE_GROUP_LABELS, TRACKING_TYPE_LABELS } from '@/lib/labels';
import { colors, spacing } from '@/theme';

export default function ExercisesScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(listExercises);
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [search, setSearch] = useState('');

  if (!data) return <Loading />;
  const q = search.trim().toLowerCase();
  const filtered = data.filter(
    (e) => (!group || e.muscleGroup === group) && (!q || e.name.toLowerCase().includes(q)),
  );

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Вправи"
        mode="root"
        right={
          <CircleButton
            icon="add"
            background={colors.accent}
            color={colors.accentText}
            onPress={() => router.push('/exercise/edit')}
          />
        }
      />
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        keyboardShouldPersistTaps="handled"
        data={filtered}
        keyExtractor={(e) => String(e.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchField
              placeholder="Пошук вправ…"
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
            />
            <ChipScroller>
              <Chip label="Усі" selected={group === null} onPress={() => setGroup(null)} />
              {MUSCLE_GROUPS.map((g) => (
                <Chip
                  key={g}
                  label={MUSCLE_GROUP_LABELS[g]}
                  selected={g === group}
                  onPress={() => setGroup(g)}
                />
              ))}
            </ChipScroller>
            <Text variant="heading">
              {group ? MUSCLE_GROUP_LABELS[group] : 'Усі вправи'} · {filtered.length}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card
            onPress={() =>
              router.push({
                pathname: '/exercise/[id]',
                params: { id: item.id },
              })
            }
            style={styles.item}>
            <ExerciseThumb uri={item.imageUri} size={56} />
            <View style={styles.itemText}>
              <Text variant="body" numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="muted">
                {MUSCLE_GROUP_LABELS[item.muscleGroup]} ·{' '}
                <Text variant="muted" style={styles.accent}>
                  {TRACKING_TYPE_LABELS[item.trackingType]}
                </Text>
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon="barbell" title="Нічого не знайдено" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  header: { gap: spacing.lg, marginBottom: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.lg,
  },
  itemText: { flex: 1, gap: 2 },
  accent: { color: colors.accent },
});
