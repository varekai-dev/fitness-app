import { FlatList, StyleSheet } from 'react-native';

import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import { EmptyState, Loading } from '@/components/ui';
import { listFinishedWorkouts } from '@/db/workouts';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, spacing } from '@/theme';

export default function HistoryScreen() {
  const { data } = useDbQuery(listFinishedWorkouts);
  if (!data) return <Loading />;
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={data}
      keyExtractor={(w) => String(w.id)}
      renderItem={({ item }) => <WorkoutSummaryCard workout={item} />}
      ListEmptyComponent={<EmptyState icon="time" title="Історія порожня" hint="Тут з'являться завершені тренування." />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
});
