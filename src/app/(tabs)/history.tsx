import { FlatList, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { useTabBarSpace } from '@/components/floating-tab-bar';
import { Backdrop } from '@/components/glass';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import { EmptyState, Loading, ScreenHeader } from '@/components/ui';
import { listBodyWeights } from '@/db/body-weight';
import { deleteWorkout, listFinishedWorkouts } from '@/db/workouts';
import { estimateKcal } from '@/lib/calories';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, spacing } from '@/theme';

export default function HistoryScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(async () => {
    const [workouts, weights] = await Promise.all([listFinishedWorkouts(), listBodyWeights()]);
    return { workouts, weights };
  });
  const dialog = useDialog();
  if (!data) return <Loading />;

  const remove = (id: number, close: () => void) =>
    dialog.show({
      title: 'Видалити тренування?',
      message: 'Усі записані підходи буде видалено.',
      buttons: [
        { text: 'Ні', style: 'cancel', onPress: close },
        { text: 'Видалити', style: 'destructive', onPress: () => deleteWorkout(id) },
      ],
    });

  return (
    <View style={styles.root}>
      <Backdrop />
      <ScreenHeader title="Історія" mode="root" />
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        data={data.workouts}
        keyExtractor={(w) => String(w.id)}
        renderItem={({ item }) => (
          <SwipeToDelete onDelete={(close) => remove(item.id, close)}>
            <WorkoutSummaryCard workout={item} kcal={estimateKcal(item, data.weights)} />
          </SwipeToDelete>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="time"
            title="Історія порожня"
            hint="Тут з'являться завершені тренування."
          />
        }
      />
      {dialog.element}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
