import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDialog } from '@/components/dialog';
import { confirmRemoveExercise } from '@/components/remove-dialogs';
import { LineChart } from '@/components/line-chart';
import { MuscleIcon } from '@/components/muscle-icon';
import {
  Badge,
  Button,
  Card,
  CircleButton,
  EmptyState,
  goBack,
  Loading,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
} from '@/components/ui';
import { getExercise } from '@/db/exercises';
import { getExerciseHistory } from '@/db/workouts';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import {
  formatDate,
  formatShortDate,
  MUSCLE_GROUP_LABELS,
  TRACKING_TYPE_LABELS,
} from '@/lib/labels';
import {
  displayMetric,
  formatDisplayMetric,
  formatMetric,
  formatSet,
  METRIC_INFO,
} from '@/lib/metrics';
import { computeProgress } from '@/lib/progress';
import { colors, spacing } from '@/theme';
import { exerciseImageSource } from '@/lib/exercise-images';

export default function ExerciseDetailScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const insets = useSafeAreaInsets();
  const { data } = useFocusedDbQuery(async () => {
    const [exercise, history] = await Promise.all([getExercise(id), getExerciseHistory(id)]);
    return { exercise, history };
  }, [id]);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const { exercise, history } = data;
  if (!exercise) {
    return (
      <Screen title={t`Вправа`}>
        <EmptyState icon="alert-circle" title={t`Вправу не знайдено`} />
      </Screen>
    );
  }

  const type = exercise.trackingType;
  const progress = computeProgress(type, history);
  const prWorkoutIds = new Set(progress.filter((p) => p.isPR).map((p) => p.workoutId));
  const record = progress.filter((p) => p.isPR).at(-1);
  const latest = progress.at(-1);

  const remove = () => confirmRemoveExercise(dialog.show, exercise, { onRemoved: goBack });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          {exercise.imageUri ? (
            <Image
              source={exerciseImageSource(exercise.imageUri)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="barbell" size={96} color={colors.accent} />
            </View>
          )}
          {exercise.imageUri && <View style={styles.heroShade} />}
          <View style={styles.heroTitle}>
            <Text variant="title">{exercise.name}</Text>
            <Row style={styles.badges}>
              <Badge label={MUSCLE_GROUP_LABELS[exercise.muscleGroup]} />
              <Badge label={TRACKING_TYPE_LABELS[type]} tone="muted" />
              {exercise.archivedAt !== null && (
                <Badge label={t`В архіві`} tone="warning" />
              )}
            </Row>
          </View>
        </View>

        <View style={styles.content}>
          <Card>
            <Row style={styles.muscles}>
              <MuscleIcon group={exercise.muscleGroup} size={72} />
              <View>
                <Text variant="overline">{t`Що качає`}</Text>
                <Text variant="heading">{MUSCLE_GROUP_LABELS[exercise.muscleGroup]}</Text>
              </View>
            </Row>
          </Card>
          {exercise.youtubeUrl && (
            <Button
              title={t`Дивитись техніку на YouTube`}
              icon="logo-youtube"
              variant="secondary"
              onPress={() => WebBrowser.openBrowserAsync(exercise.youtubeUrl!)}
            />
          )}
          {exercise.notes && (
            <Card>
              <Text variant="overline">{t`Нотатки`}</Text>
              <Text variant="secondary">{exercise.notes}</Text>
            </Card>
          )}

          <SectionHeader title={t`Прогрес`} />
          {progress.length === 0 ? (
            <EmptyState
              icon="trending-up"
              title={t`Ще немає даних`}
              hint={t`Графік з’явиться після першого тренування з цією вправою.`}
            />
          ) : (
            <>
              <Row style={styles.stats}>
                <StatTile
                  icon="trophy"
                  value={record ? formatMetric(type, record.best) : '—'}
                  label={t`Рекорд`}
                />
                <StatTile
                  icon="pulse"
                  value={latest ? formatMetric(type, latest.best) : '—'}
                  label={t`Останній`}
                />
                <StatTile
                  icon="calendar"
                  value={String(progress.length)}
                  label={t`Сесій`}
                />
              </Row>
              <Card>
                <Text variant="caption">{METRIC_INFO[type].label}</Text>
                <LineChart
                  points={progress.map((p) => ({
                    x: p.date,
                    y: displayMetric(type, p.best),
                    highlight: p.isPR,
                  }))}
                  formatY={(v) => formatDisplayMetric(type, v).split(' ')[0]}
                  formatX={formatShortDate}
                />
              </Card>
            </>
          )}

          {history.length > 0 && <SectionHeader title={t`Історія`} />}
          {[...history].reverse().map((h) => (
            <Card
              key={h.workoutId}
              onPress={() =>
                router.push({
                  pathname: '/workout/[id]',
                  params: { id: h.workoutId },
                })
              }>
              <Row style={styles.spaceBetween}>
                <Text variant="body">{formatDate(h.date)}</Text>
                {prWorkoutIds.has(h.workoutId) && (
                  <Row>
                    <Ionicons name="trophy" size={14} color={colors.warning} />
                    <Text variant="caption" style={{ color: colors.warning }}>
                      PR
                    </Text>
                  </Row>
                )}
              </Row>
              <Text variant="muted">{h.sets.map((s) => formatSet(type, s)).join(' · ')}</Text>
            </Card>
          ))}

          <Button
            title={t`Видалити вправу`}
            variant="danger"
            icon="trash-outline"
            onPress={remove}
          />
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <CircleButton icon="chevron-back" background="rgba(0,0,0,0.45)" onPress={goBack} />
        <CircleButton
          icon="create-outline"
          background="rgba(0,0,0,0.45)"
          onPress={() => router.push({ pathname: '/exercise/edit', params: { id } })}
        />
      </View>
      {dialog.element}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl * 2 },
  hero: { height: 340, justifyContent: 'flex-end' },
  heroPlaceholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '45%',
    backgroundColor: 'rgba(20,20,20,0.55)',
  },
  heroTitle: { padding: spacing.lg, gap: spacing.sm },
  badges: { flexWrap: 'wrap' },
  content: { padding: spacing.lg, gap: spacing.lg },
  muscles: { gap: spacing.lg },
  stats: { gap: spacing.sm, alignItems: 'stretch' },
  spaceBetween: { justifyContent: 'space-between' },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
