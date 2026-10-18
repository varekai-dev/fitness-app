import { useRef } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { ActivityCalendar } from '@/components/activity-calendar';
import { ActivityCard } from '@/components/activity-card';
import { useDialog } from '@/components/dialog';
import { ROW_LAYOUT } from '@/components/motion';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import { EmptyState, Loading } from '@/components/ui';
import { hideActivity, listActivities } from '@/db/activities';
import { listBodyWeights } from '@/db/body-weight';
import { deleteWorkout, listFinishedWorkouts } from '@/db/workouts';
import { estimateKcal } from '@/lib/calories';
import { useDbQuery } from '@/hooks/use-db-query';
import { useScrollResetOnTabLeave } from '@/hooks/use-scroll-reset-on-tab-leave';
import { useToday } from '@/hooks/use-today';
import { tr } from '@/lib/i18n';
import { spacing } from '@/theme';

type Workout = Awaited<ReturnType<typeof listFinishedWorkouts>>[number];
type Activity = Awaited<ReturnType<typeof listActivities>>[number];
type Item = { kind: 'workout'; workout: Workout } | { kind: 'activity'; activity: Activity };

const startOf = (item: Item) =>
  item.kind === 'workout' ? item.workout.startedAt : item.activity.startedAt;

/**
 * The History section of the Training tab: activity calendar, finished
 * workouts and activities imported from Apple Health / Health Connect.
 */
export function HistoryView({ bottomSpace }: { bottomSpace: number }) {
  const listRef = useRef<FlatList<Item>>(null);
  useScrollResetOnTabLeave(listRef);
  const today = useToday();
  const { data } = useDbQuery(async () => {
    const [workouts, activities, weights] = await Promise.all([
      listFinishedWorkouts(),
      listActivities(),
      listBodyWeights(),
    ]);
    const items: Item[] = [
      ...workouts.map((workout) => ({ kind: 'workout' as const, workout })),
      ...activities.map((activity) => ({ kind: 'activity' as const, activity })),
    ].sort((a, b) => startOf(b) - startOf(a));
    return { items, weights, loadedAt: Date.now() };
  }, [today]);
  const dialog = useDialog();
  if (!data) return <Loading />;

  const remove = (item: Item, close: () => void) =>
    dialog.show(
      item.kind === 'workout'
        ? {
            title: tr('Видалити тренування?', 'Delete workout?'),
            message: tr('Усі записані підходи буде видалено.', 'All logged sets will be deleted.'),
            buttons: [
              { text: tr('Ні', 'No'), style: 'cancel', onPress: close },
              {
                text: tr('Видалити', 'Delete'),
                style: 'destructive',
                onPress: () => deleteWorkout(item.workout.id),
              },
            ],
          }
        : {
            title: tr('Прибрати з історії?', 'Remove from history?'),
            message: tr(
              'Запис залишиться в застосунку здоров’я, але сюди більше не потрапить.',
              'The record stays in the health app but won’t come back here.',
            ),
            buttons: [
              { text: tr('Ні', 'No'), style: 'cancel', onPress: close },
              {
                text: tr('Прибрати', 'Remove'),
                style: 'destructive',
                onPress: () => hideActivity(item.activity.id),
              },
            ],
          },
    );

  return (
    <>
      <Animated.FlatList
        ref={listRef}
        // Workouts below a deleted one slide up instead of jumping.
        itemLayoutAnimation={ROW_LAYOUT}
        contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
        data={data.items}
        ListHeaderComponent={
          <ActivityCalendar workoutDates={data.items.map(startOf)} now={data.loadedAt} />
        }
        ListHeaderComponentStyle={styles.calendar}
        keyExtractor={(item) =>
          item.kind === 'workout' ? `w${item.workout.id}` : `a${item.activity.id}`
        }
        renderItem={({ item }) => (
          <SwipeToDelete onDelete={(close) => remove(item, close)}>
            {item.kind === 'workout' ? (
              <WorkoutSummaryCard
                workout={item.workout}
                kcal={estimateKcal(item.workout, data.weights)}
              />
            ) : (
              <ActivityCard activity={item.activity} />
            )}
          </SwipeToDelete>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="time"
            title={tr('Історія порожня', 'History is empty')}
            hint={tr(
              'Тут з’являться завершені тренування та активності з застосунку здоров’я.',
              'Finished workouts and activities from the health app will appear here.',
            )}
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
