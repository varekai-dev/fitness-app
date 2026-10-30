import { plural, t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Elapsed } from '@/components/elapsed';
import { WorkoutSummaryCard } from '@/components/workout-summary-card';
import {
  Button,
  Card,
  Chip,
  ChipScroller,
  EmptyState,
  Loading,
  Row,
  SectionHeader,
  StatTile,
  Text,
} from '@/components/ui';
import { listBodyWeights } from '@/db/body-weight';
import { getActiveProgram, getNextDayId } from '@/db/programs';
import {
  deleteWorkout,
  getActiveWorkout,
  hasCompletedSets,
  listFinishedWorkouts,
  startWorkout,
} from '@/db/workouts';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import { useScrollResetOnTabLeave } from '@/hooks/use-scroll-reset-on-tab-leave';
import { useToday } from '@/hooks/use-today';
import { estimateKcal } from '@/lib/calories';
import { startOfWeek } from '@/lib/labels';
import { notStarted } from '@/lib/metrics';
import { colors, fontSize, radius, spacing } from '@/theme';

async function loadOverview() {
  const [activeWorkout, program, finished, bodyWeights] = await Promise.all([
    getActiveWorkout(),
    getActiveProgram(),
    listFinishedWorkouts(),
    listBodyWeights(),
  ]);
  const nextDayId = program ? await getNextDayId(program.id) : null;
  // A workout opened but never started is only a draft of its day: the day can still
  // be switched, which replaces it. Once the clock ran or a set was done, it stays.
  const draft =
    activeWorkout &&
    notStarted(activeWorkout) &&
    program?.days.some((d) => d.id === activeWorkout.programDayId) &&
    !(await hasCompletedSets(activeWorkout.id))
      ? activeWorkout
      : null;
  return { activeWorkout, draft, program, nextDayId, finished, bodyWeights, loadedAt: Date.now() };
}

/**
 * The "Today" section of the Training tab: this week's stats, the workout to
 * start or resume, and the latest finished workouts.
 */
export function OverviewView({
  bottomSpace,
  onSection,
}: {
  bottomSpace: number;
  /** Switches the Training tab to another section. */
  onSection: (section: 'programs' | 'history') => void;
}) {
  const today = useToday();
  const { data } = useFocusedDbQuery(loadOverview, [today]);
  const scrollRef = useRef<ScrollViewInstance>(null);
  useScrollResetOnTabLeave(scrollRef);
  const [pickedDayId, setPickedDayId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const { activeWorkout, draft, program, nextDayId, finished, bodyWeights, loadedAt } = data;
  // A manual pick may point to another program's day after switching programs.
  const selectedDay =
    program?.days.find((d) => d.id === pickedDayId) ??
    program?.days.find((d) => d.id === (draft?.programDayId ?? nextDayId));
  const isDraftDay = draft !== null && selectedDay?.id === draft.programDayId;
  const daySets = selectedDay?.exercises.reduce((n, e) => n + e.targetSets, 0) ?? 0;

  const weekStart = startOfWeek(loadedAt);
  const thisWeek = finished.filter((w) => w.startedAt >= weekStart);
  // Null when no body weight has been logged, since calories depend on it.
  const weekKcal =
    bodyWeights.length > 0
      ? thisWeek.reduce((sum, w) => sum + (estimateKcal(w, bodyWeights) ?? 0), 0)
      : null;

  const openWorkout = (id: number) => router.push({ pathname: '/workout/[id]', params: { id } });

  const start = async () => {
    if (!selectedDay) return;
    if (draft && isDraftDay) return openWorkout(draft.id);
    setStarting(true);
    try {
      if (draft) await deleteWorkout(draft.id);
      const id = await startWorkout(selectedDay.id);
      setPickedDayId(null);
      openWorkout(id);
    } catch (e) {
      dialog.show({
        title: t`Помилка`,
        message: (e as Error).message,
        icon: 'alert-circle',
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}>
      <Row style={styles.stats}>
        <StatTile
          icon="flame"
          value={String(thisWeek.length)}
          label={t({ message: 'За тиждень', context: 'This week' })}
        />
        <StatTile
          icon="bonfire"
          value={weekKcal !== null ? String(Math.round(weekKcal)) : '—'}
          unit={weekKcal !== null ? t`ккал` : undefined}
          label={t`Спалено`}
        />
        <StatTile icon="trophy" value={String(finished.length)} label={t`Усього`} />
      </Row>

      {activeWorkout && !draft ? (
        <HeroCard
          overline={
            notStarted(activeWorkout)
              ? t`Тренування не розпочато`
              : activeWorkout.pausedAt
                ? t`Тренування на паузі`
                : t`Тренування триває`
          }
          title={activeWorkout.dayName}
          subtitle={activeWorkout.programName}
          meta={<Elapsed workout={activeWorkout} style={styles.heroElapsed} />}
          actionIcon="play"
          onAction={() => openWorkout(activeWorkout.id)}
        />
      ) : !program ? (
        <Card>
          <EmptyState
            icon="calendar"
            title={t`Немає активної програми`}
            hint={t`Створи програму з днями тренувань, щоб почати.`}
          />
          <Button
            title={t`До програм`}
            trailingIcon="arrow-forward"
            onPress={() => onSection('programs')}
          />
        </Card>
      ) : program.days.length === 0 || !selectedDay ? (
        <Card>
          <EmptyState
            icon="calendar"
            title={t`У програмі «${program.name}» ще немає днів`}
          />
          <Button
            title={t`Редагувати програму`}
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
            overline={
              isDraftDay
                ? t`Тренування не розпочато`
                : selectedDay.id === nextDayId
                  ? t`Наступне тренування`
                  : t`Обраний день`
            }
            title={selectedDay.name}
            subtitle={program.name}
            meta={
              <Row style={styles.heroMeta}>
                <Ionicons name="barbell-outline" size={14} color={colors.accentText} />
                <Text variant="caption" style={styles.heroText}>
                  {selectedDay.exercises.length}{' '}
                  {plural(selectedDay.exercises.length, { one: 'вправа', few: 'вправи', many: 'вправ', other: 'вправи' })}{' '}
                  · {daySets} {plural(daySets, { one: 'підхід', few: 'підходи', many: 'підходів', other: 'підходи' })}
                </Text>
              </Row>
            }
            details={selectedDay.exercises.slice(0, 4).map((e) => e.exercise.name)}
            moreCount={Math.max(0, selectedDay.exercises.length - 4)}
            actionIcon={isDraftDay ? 'play' : 'arrow-forward'}
            actionLoading={starting}
            onAction={start}
          />
        </>
      )}

      <SectionHeader
        title={t`Останні тренування`}
        action={
          finished.length > 0 ? (
            <Button
              title={t`Усі`}
              variant="ghost"
              small
              onPress={() => onSection('history')}
            />
          ) : undefined
        }
      />
      {finished.length === 0 ? (
        <EmptyState
          icon="time"
          title={t`Ще немає завершених тренувань`}
        />
      ) : (
        finished
          .slice(0, 2)
          .map((w) => (
            <WorkoutSummaryCard key={w.id} workout={w} kcal={estimateKcal(w, bodyWeights)} />
          ))
      )}
      {dialog.element}
    </ScrollView>
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
              + {t`ще`} {moreCount}
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
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  stats: { gap: spacing.sm, alignItems: 'stretch' },
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
