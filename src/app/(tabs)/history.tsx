import { FlatList, StyleSheet, View } from 'react-native';

import { useTabBarSpace } from '@/components/floating-tab-bar';
import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import { EmptyState, Loading, ScreenHeader } from '@/components/ui';
import { listFinishedWorkouts } from '@/db/workouts';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, spacing } from '@/theme';

export default function HistoryScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(listFinishedWorkouts);
  if (!data) return <Loading />;
  return (
    <View style={styles.root}>
      <ScreenHeader title="Історія" mode="root" />
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        data={data}
        keyExtractor={(w) => String(w.id)}
        renderItem={({ item }) => <WorkoutSummaryCard workout={item} />}
        ListEmptyComponent={
          <EmptyState
            icon="time"
            title="Історія порожня"
            hint="Тут з'являться завершені тренування."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
