import { FlatList, StyleSheet } from 'react-native';

import { ActivityCalendar } from '@/components/activity-calendar';
import { useDialog } from '@/components/dialog';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import { EmptyState, Loading } from '@/components/ui';
import { listBodyWeights } from '@/db/body-weight';
import { deleteWorkout, listFinishedWorkouts } from '@/db/workouts';
import { estimateKcal } from '@/lib/calories';
import { useDbQuery } from '@/hooks/use-db-query';
import { useToday } from '@/hooks/use-today';
import { spacing } from '@/theme';

/** The History section of the Training tab: activity calendar and finished workouts. */
export function HistoryView({ bottomSpace }: { bottomSpace: number }) {
  const today = useToday();
  const { data } = useDbQuery(async () => {
    const [workouts, weights] = await Promise.all([listFinishedWorkouts(), listBodyWeights()]);
    return { workouts, weights, loadedAt: Date.now() };
  }, [today]);
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
    <>
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        data={data.workouts}
        ListHeaderComponent={
          <ActivityCalendar
            workoutDates={data.workouts.map((w) => w.startedAt)}
            now={data.loadedAt}
          />
        }
        ListHeaderComponentStyle={styles.calendar}
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
    </>
  );
}

const styles = StyleSheet.create({
  calendar: { marginBottom: spacing.sm },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
