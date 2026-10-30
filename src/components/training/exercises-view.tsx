import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { MuscleIcon } from '@/components/muscle-icon';
import { confirmRemoveExercise } from '@/components/remove-dialogs';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { Card, Chip, ChipScroller, EmptyState, Loading, SearchField, Text } from '@/components/ui';
import { listExercises } from '@/db/exercises';
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '@/db/schema';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import { useScrollResetOnTabLeave } from '@/hooks/use-scroll-reset-on-tab-leave';
import { MUSCLE_GROUP_LABELS, TRACKING_TYPE_LABELS } from '@/lib/labels';
import { colors, spacing } from '@/theme';

/** The Exercises section of the Training tab: the searchable exercise library. */
export function ExercisesView({ bottomSpace }: { bottomSpace: number }) {
  const { data } = useFocusedDbQuery(listExercises);
  const listRef = useRef<FlatList<Exercise>>(null);
  useScrollResetOnTabLeave(listRef);
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [search, setSearch] = useState('');
  const dialog = useDialog();

  if (!data) return <Loading />;
  const q = search.trim().toLowerCase();
  const filtered = data.filter(
    (e) => (!group || e.muscleGroup === group) && (!q || e.name.toLowerCase().includes(q)),
  );

  return (
    <>
      <FlatList
        ref={listRef}
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        keyboardShouldPersistTaps="handled"
        data={filtered}
        keyExtractor={(e) => String(e.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchField
              placeholder={t`Пошук вправ…`}
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
            />
            <ChipScroller>
              <Chip
                label={t`Усі`}
                selected={group === null}
                onPress={() => setGroup(null)}
              />
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
              {group ? MUSCLE_GROUP_LABELS[group] : t`Усі вправи`} ·{' '}
              {filtered.length}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const card = (
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
              <MuscleIcon group={item.muscleGroup} size={40} />
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Card>
          );
          // Only exercises the user made can be swiped away; library ones from their screen.
          return item.builtIn ? (
            card
          ) : (
            <SwipeToDelete
              onDelete={(close) => confirmRemoveExercise(dialog.show, item, { onKept: close })}>
              {card}
            </SwipeToDelete>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon="barbell" title={t`Нічого не знайдено`} />
        }
      />
      {dialog.element}
    </>
  );
}

const styles = StyleSheet.create({
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
