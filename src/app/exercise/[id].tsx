import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/line-chart';
import { Button, Card, EmptyState, IconButton, Loading, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { getExercise, removeExercise } from '@/db/exercises';
import { getExerciseHistory } from '@/db/workouts';
import { useDbQuery } from '@/hooks/use-db-query';
import { deleteStoredImage } from '@/lib/images';
import { formatDate, formatShortDate, MUSCLE_GROUP_LABELS, TRACKING_TYPE_LABELS } from '@/lib/labels';
import { formatMetric, formatSet, METRIC_INFO } from '@/lib/metrics';
import { computeProgress } from '@/lib/progress';
import { colors, radius, spacing } from '@/theme';

export default function ExerciseDetailScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data } = useDbQuery(
    async () => {
      const [exercise, history] = await Promise.all([getExercise(id), getExerciseHistory(id)]);
      return { exercise, history };
    },
    [id],
  );

  if (!data) return <Loading />;
  const { exercise, history } = data;
  if (!exercise) return <EmptyState icon="alert-circle" title="Вправу не знайдено" />;

  const type = exercise.trackingType;
  const progress = computeProgress(type, history);
  const prWorkoutIds = new Set(progress.filter((p) => p.isPR).map((p) => p.workoutId));
  const record = progress.filter((p) => p.isPR).at(-1);

  const remove = () =>
    Alert.alert('Видалити вправу?', exercise.name, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          const result = await removeExercise(id);
          if (typeof result === 'object') {
            Alert.alert('Вправа використовується', `Спершу прибери її з програм: ${result.blockedBy.join(', ')}.`);
            return;
          }
          if (result === 'deleted') deleteStoredImage(exercise.imageUri);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <IconButton
              icon="create-outline"
              color={colors.accent}
              onPress={() => router.push({ pathname: '/exercise/edit', params: { id } })}
            />
          ),
        }}
      />
      {exercise.imageUri && <Image source={{ uri: exercise.imageUri }} style={styles.image} contentFit="cover" />}
      <View style={styles.titleBlock}>
        <Text variant="title">{exercise.name}</Text>
        <Text variant="caption">
          {MUSCLE_GROUP_LABELS[exercise.muscleGroup]} · {TRACKING_TYPE_LABELS[type]}
          {exercise.archivedAt ? ' · в архіві' : ''}
        </Text>
      </View>
      {exercise.youtubeUrl && (
        <Button title="Відео на YouTube" icon="logo-youtube" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(exercise.youtubeUrl!)} />
      )}
      {exercise.notes && (
        <Card>
          <Text variant="secondary">{exercise.notes}</Text>
        </Card>
      )}

      <SectionHeader title="Прогрес" />
      {progress.length === 0 ? (
        <EmptyState icon="trending-up" title="Ще немає даних" hint="Графік з’явиться після першого тренування з цією вправою." />
      ) : (
        <Card>
          <Row style={styles.spaceBetween}>
            <Text variant="caption">{METRIC_INFO[type].label}</Text>
            {record && (
              <Row>
                <Ionicons name="trophy" size={14} color={colors.warning} />
                <Text variant="caption">
                  {formatMetric(type, record.best)} · {formatShortDate(record.date)}
                </Text>
              </Row>
            )}
          </Row>
          <LineChart
            points={progress.map((p) => ({ x: p.date, y: p.best, highlight: p.isPR }))}
            formatY={(v) => formatMetric(type, v).split(' ')[0]}
            formatX={formatShortDate}
          />
        </Card>
      )}

      {history.length > 0 && <SectionHeader title="Історія" />}
      {[...history].reverse().map((h) => (
        <Card key={h.workoutId} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: h.workoutId } })}>
          <Row style={styles.spaceBetween}>
            <Text variant="heading">{formatDate(h.date)}</Text>
            {prWorkoutIds.has(h.workoutId) && (
              <Row>
                <Ionicons name="trophy" size={14} color={colors.warning} />
                <Text variant="caption" style={{ color: colors.warning }}>PR</Text>
              </Row>
            )}
          </Row>
          <Text variant="secondary">{h.sets.map((s) => formatSet(type, s)).join(' · ')}</Text>
        </Card>
      ))}

      <Button title="Видалити вправу" variant="danger" icon="trash-outline" onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  titleBlock: { gap: spacing.xs },
  spaceBetween: { justifyContent: 'space-between' },
});
