import Ionicons from '@expo/vector-icons/Ionicons';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { useDialog } from '@/components/dialog';
import { useTabBarSpace } from '@/components/floating-tab-bar';
import { Backdrop } from '@/components/glass';
import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import { EmptyState, Loading, ScreenHeader } from '@/components/ui';
import { listBodyWeights } from '@/db/body-weight';
import { deleteWorkout, listFinishedWorkouts } from '@/db/workouts';
import { estimateKcal } from '@/lib/calories';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, radius, spacing } from '@/theme';

const ACTION_WIDTH = 72;

export default function HistoryScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(async () => {
    const [workouts, weights] = await Promise.all([listFinishedWorkouts(), listBodyWeights()]);
    return { workouts, weights };
  });
  const dialog = useDialog();
  if (!data) return <Loading />;

  const remove = (id: number, swipeable: SwipeableMethods) =>
    dialog.show({
      title: 'Видалити тренування?',
      message: 'Усі записані підходи буде видалено.',
      buttons: [
        { text: 'Ні', style: 'cancel', onPress: swipeable.close },
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
          <ReanimatedSwipeable
            friction={2}
            rightThreshold={ACTION_WIDTH / 2}
            overshootRight={false}
            renderRightActions={(progress, _translation, swipeable) => (
              <DeleteAction progress={progress} onPress={() => remove(item.id, swipeable)} />
            )}>
            <WorkoutSummaryCard workout={item} kcal={estimateKcal(item, data.weights)} />
          </ReanimatedSwipeable>
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

/** Trash button revealed by swiping a workout to the left. */
function DeleteAction({
  progress,
  onPress,
}: {
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.6, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={styles.action}>
      <Animated.View style={style}>
        <Pressable
          onPress={onPress}
          hitSlop={8}
          style={({ pressed }) => [styles.trash, pressed && styles.pressed]}>
          <Ionicons name="trash-outline" size={22} color={colors.text} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  action: { width: ACTION_WIDTH, alignItems: 'flex-end', justifyContent: 'center' },
  trash: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
