import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTabBarSpace } from '@/components/floating-tab-bar';
import { ActivityCalendar } from '@/components/activity-calendar';
import { useDialog } from '@/components/dialog';
import { Elapsed } from '@/components/elapsed';
import { Sparkline } from '@/components/line-chart';
import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import {
  Button,
  Card,
  Chip,
  ChipScroller,
  EmptyState,
  Loading,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
} from '@/components/ui';
import { listBodyWeights } from '@/db/body-weight';
import { getActiveProgram, getNextDayId } from '@/db/programs';
import { getActiveWorkout, listFinishedWorkouts, startWorkout } from '@/db/workouts';
import { useDbQuery } from '@/hooks/use-db-query';
import { estimateKcal } from '@/lib/calories';
import { formatLongDate, formatShortDate, formatWeightDelta, startOfWeek } from '@/lib/labels';
import { formatNumber } from '@/lib/metrics';
import { dailyPhrase } from '@/lib/motivation';
import { prepareRestNotifications } from '@/lib/rest-notifications';
import { colors, fontSize, radius, spacing } from '@/theme';

async function loadHome() {
  const [activeWorkout, program, finished, bodyWeights] = await Promise.all([
    getActiveWorkout(),
    getActiveProgram(),
    listFinishedWorkouts(),
    listBodyWeights(),
  ]);
  const nextDayId = program ? await getNextDayId(program.id) : null;
  return { activeWorkout, program, nextDayId, finished, bodyWeights, loadedAt: Date.now() };
}

export default function HomeScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(loadHome);
  const [pickedDayId, setPickedDayId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const { activeWorkout, program, nextDayId, finished, bodyWeights, loadedAt } = data;
  const weight = bodyWeights.at(-1);
  const prevWeight = bodyWeights.at(-2);
  // A manual pick may point to another program's day after switching programs.
  const selectedDay =
    program?.days.find((d) => d.id === pickedDayId) ??
    program?.days.find((d) => d.id === nextDayId);

  const weekStart = startOfWeek(loadedAt);
  const thisWeek = finished.filter((w) => w.startedAt >= weekStart);
  // Null when no body weight has been logged, since calories depend on it.
  const weekKcal =
    bodyWeights.length > 0
      ? thisWeek.reduce((sum, w) => sum + (estimateKcal(w, bodyWeights) ?? 0), 0)
      : null;

  const start = async () => {
    if (!selectedDay) return;
    setStarting(true);
    try {
      await prepareRestNotifications();
      const id = await startWorkout(selectedDay.id);
      setPickedDayId(null);
      router.push({ pathname: '/workout/[id]', params: { id } });
    } catch (e) {
      dialog.show({ title: 'Помилка', message: (e as Error).message, icon: 'alert-circle' });
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen header={false} bottomSpace={tabBarSpace}>
      <View style={styles.greeting}>
        <Text variant="caption">{formatLongDate(loadedAt)}</Text>
        <Text variant="title">
          {dailyPhrase(new Date(loadedAt))}{' '}
          <Ionicons name="flash" size={26} color={colors.accent} />
        </Text>
      </View>

      <Row style={styles.stats}>
        <StatTile icon="flame" value={String(thisWeek.length)} label="За тиждень" />
        <StatTile
          icon="bonfire"
          value={weekKcal !== null ? String(Math.round(weekKcal)) : '—'}
          unit={weekKcal !== null ? 'ккал' : undefined}
          label="Спалено"
        />
        <StatTile icon="trophy" value={String(finished.length)} label="Усього" />
      </Row>

      {activeWorkout ? (
        <HeroCard
          overline={activeWorkout.pausedAt ? 'Тренування на паузі' : 'Тренування триває'}
          title={activeWorkout.dayName}
          subtitle={activeWorkout.programName}
          meta={<Elapsed workout={activeWorkout} style={styles.heroElapsed} />}
          actionIcon="play"
          onAction={() =>
            router.push({
              pathname: '/workout/[id]',
              params: { id: activeWorkout.id },
            })
          }
        />
      ) : !program ? (
        <Card>
          <EmptyState
            icon="calendar"
            title="Немає активної програми"
            hint="Створи програму з днями тренувань, щоб почати."
          />
          <Button
            title="До програм"
            trailingIcon="arrow-forward"
            onPress={() => router.navigate('/programs')}
          />
        </Card>
      ) : program.days.length === 0 || !selectedDay ? (
        <Card>
          <EmptyState icon="calendar" title={`У програмі «${program.name}» ще немає днів`} />
          <Button
            title="Редагувати програму"
            trailingIcon="arrow-forward"
            onPress={() =>
              router.push({
                pathname: '/program/[id]',
                params: { id: program.id },
              })
            }
          />
        </Card>
      ) : (
        <>
          {program.days.length > 1 && (
            <ChipScroller>
              {program.days.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  selected={d.id === selectedDay.id}
                  onPress={() => setPickedDayId(d.id)}
                />
              ))}
            </ChipScroller>
          )}
          <HeroCard
            overline={selectedDay.id === nextDayId ? 'Наступне тренування' : 'Обраний день'}
            title={selectedDay.name}
            subtitle={program.name}
            meta={
              <Row style={styles.heroMeta}>
                <Ionicons name="barbell-outline" size={14} color={colors.accentText} />
                <Text variant="caption" style={styles.heroText}>
                  {selectedDay.exercises.length} вправ ·{' '}
                  {selectedDay.exercises.reduce((n, e) => n + e.targetSets, 0)} підходів
                </Text>
              </Row>
            }
            details={selectedDay.exercises.slice(0, 4).map((e) => e.exercise.name)}
            moreCount={Math.max(0, selectedDay.exercises.length - 4)}
            actionIcon="arrow-forward"
            actionLoading={starting}
            onAction={start}
          />
        </>
      )}

      <ActivityCalendar workoutDates={finished.map((w) => w.startedAt)} now={loadedAt} />

      <Card onPress={() => router.push('/body-weight')}>
        <Row style={styles.spaceBetween}>
          <Row>
            <Ionicons name="scale-outline" size={20} color={colors.accent} />
            <Text variant="heading">Вага тіла</Text>
          </Row>
          <Row>
            {weight ? (
              <View style={styles.weightValue}>
                <Text variant="heading">{formatNumber(weight.weightKg, 1)} кг</Text>
                <Text variant="muted">
                  {prevWeight
                    ? `${formatWeightDelta(weight.weightKg - prevWeight.weightKg)} кг · `
                    : ''}
                  {formatShortDate(weight.measuredAt)}
                </Text>
              </View>
            ) : (
              <Text variant="muted">Додати</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
        </Row>
        {bodyWeights.length === 1 ? (
          <Text variant="muted">Графік з’явиться після зважування в інший день.</Text>
        ) : (
          <Sparkline
            points={bodyWeights.slice(-30).map((w) => ({ x: w.measuredAt, y: w.weightKg }))}
          />
        )}
      </Card>

      <SectionHeader
        title="Останні тренування"
        action={
          finished.length > 0 ? (
            <Button title="Усі" variant="ghost" small onPress={() => router.navigate('/history')} />
          ) : undefined
        }
      />
      {finished.length === 0 ? (
        <EmptyState icon="time" title="Ще немає завершених тренувань" />
      ) : (
        finished
          .slice(0, 3)
          .map((w) => (
            <WorkoutSummaryCard key={w.id} workout={w} kcal={estimateKcal(w, bodyWeights)} />
          ))
      )}
      {dialog.element}
    </Screen>
  );
}

function HeroCard({
  overline,
  title,
  subtitle,
  meta,
  details,
  moreCount = 0,
  actionIcon,
  actionLoading,
  onAction,
}: {
  overline: string;
  title: string;
  subtitle: string;
  meta?: ReactNode;
  details?: string[];
  moreCount?: number;
  actionIcon: 'play' | 'arrow-forward';
  actionLoading?: boolean;
  onAction: () => void;
}) {
  return (
    <Pressable
      onPress={onAction}
      disabled={actionLoading}
      style={({ pressed }) => [styles.hero, pressed && styles.pressed]}>
      <View style={styles.heroGlow} />
      <Text variant="caption" style={styles.heroText}>
        {overline}
      </Text>
      <Text variant="title" style={styles.heroTitle}>
        {title}
      </Text>
      <Text variant="caption" style={styles.heroSubtle}>
        {subtitle}
      </Text>
      {meta}
      {details && details.length > 0 && (
        <View style={styles.heroDetails}>
          {details.map((d, i) => (
            <Row key={`${d}-${i}`}>
              <Text variant="muted" style={styles.heroIndex}>
                {String(i + 1).padStart(2, '0')}
              </Text>
              <Text variant="body" style={styles.heroText} numberOfLines={1}>
                {d}
              </Text>
            </Row>
          ))}
          {moreCount > 0 && (
            <Text variant="caption" style={styles.heroSubtle}>
              + ще {moreCount}
            </Text>
          )}
        </View>
      )}
      <View style={styles.heroAction}>
        <Ionicons name={actionIcon} size={24} color={colors.accent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: spacing.xs, marginTop: spacing.sm },
  stats: { gap: spacing.sm, alignItems: 'stretch' },
  spaceBetween: { justifyContent: 'space-between' },
  weightValue: { alignItems: 'flex-end' },
  pressed: { opacity: 0.85 },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
    overflow: 'hidden',
    minHeight: 200,
  },
  heroGlow: {
    position: 'absolute',
    right: -60,
    top: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.accentGradientEnd,
    opacity: 0.6,
  },
  heroText: { color: colors.accentText },
  heroSubtle: { color: colors.onAccentMuted },
  heroTitle: {
    color: colors.accentText,
    fontSize: fontSize.xxl + 4,
    marginTop: spacing.xs,
  },
  heroMeta: { marginTop: spacing.sm },
  heroElapsed: {
    color: colors.accentText,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  heroDetails: { marginTop: spacing.md, gap: spacing.xs, paddingRight: 72 },
  heroIndex: { color: colors.onAccentMuted, fontWeight: '700', width: 22 },
  heroAction: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accentText,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
