import { plural, t } from '@lingui/core/macro';
import { gte, isNotNull, sum } from 'drizzle-orm';
import * as Linking from 'expo-linking';

import { formatKcal } from '@/lib/food';
import { formatShortDate, formatWeightDelta, startOfWeek } from '@/lib/labels';
import { formatWeight, notStarted } from '@/lib/metrics';
import { weekStreak } from '@/lib/stats';
import { formatVolume, VOLUME_UNIT, WEIGHT_UNIT } from '@/lib/units';
import { addDays, startOfDay } from '@/lib/water';
import HomeWidget from '../../modules/home-widget';
import { listBodyWeights } from './body-weight';
import { db } from './client';
import { getKcalGoal } from './food';
import { getActiveProgram, getNextDayId } from './programs';
import { foodEntries, waterIntakes, workouts } from './schema';
import { getWaterGoal } from './water';
import { getActiveWorkout } from './workouts';

async function todayTotals(day: number) {
  const [[water], [food]] = await Promise.all([
    db
      .select({ ml: sum(waterIntakes.amountMl) })
      .from(waterIntakes)
      .where(gte(waterIntakes.drankAt, day)),
    db
      .select({ kcal: sum(foodEntries.kcal) })
      .from(foodEntries)
      .where(gte(foodEntries.eatenAt, day)),
  ]);
  return { waterMl: Number(water?.ml ?? 0), kcal: Number(food?.kcal ?? 0) };
}

async function loadWorkout() {
  const active = await getActiveWorkout();
  if (active) {
    return {
      label: notStarted(active)
        ? t`Не розпочато`
        : active.pausedAt
          ? t`На паузі`
          : t`Триває`,
      title: active.dayName,
      subtitle: active.programName,
      url: Linking.createURL(`workout/${active.id}`),
    };
  }
  const program = await getActiveProgram();
  const nextDayId = program ? await getNextDayId(program.id) : null;
  const day = program?.days.find((d) => d.id === nextDayId);
  const url = Linking.createURL('training', { queryParams: { view: 'programs' } });
  if (!program || !day) {
    return {
      label: t`Наступне тренування`,
      title: t`Обери програму`,
      subtitle: '',
      url,
    };
  }
  const count = day.exercises.length;
  return {
    label: t`Наступне тренування`,
    title: day.name,
    subtitle: `${program.name} · ${count} ${plural(count, { one: 'вправа', few: 'вправи', many: 'вправ', other: 'вправи' })}`,
    url,
  };
}

async function loadWeight() {
  const weights = await listBodyWeights();
  const latest = weights.at(-1);
  const first = weights[0];
  const label = t`Вага тіла`;
  const url = Linking.createURL('body-weight');
  if (!latest) {
    return { label, value: '—', unit: '', subtitle: t`Додай зважування`, url };
  }
  // Change since the first weigh-in, as on the Home tab's weight tile.
  const delta =
    weights.length > 1
      ? `${formatWeightDelta(latest.weightKg - first.weightKg)} ${WEIGHT_UNIT} · `
      : '';
  return {
    label,
    value: formatWeight(latest.weightKg, 1),
    unit: WEIGHT_UNIT,
    subtitle: delta + formatShortDate(latest.measuredAt),
    url,
  };
}

async function loadWeek(now: number) {
  const rows = await db
    .select({ startedAt: workouts.startedAt })
    .from(workouts)
    .where(isNotNull(workouts.finishedAt));
  const weekStart = startOfWeek(now);
  const count = rows.filter((w) => w.startedAt >= weekStart).length;
  const streak = weekStreak(
    now,
    rows.map((w) => w.startedAt),
  );
  return {
    label: t`Тренувань за тиждень`,
    value: String(count),
    unit: '',
    subtitle: `${t`Тижнів поспіль`}: ${streak}`,
    url: Linking.createURL('training', { queryParams: { view: 'history' } }),
    // The widget shows 0 from next Monday on, even if the app isn't opened.
    resetAt: addDays(weekStart, 7),
  };
}

/** What is left to drink today, for the widget's spare room under the total. */
function waterNote(leftMl: number) {
  if (leftMl <= 0) return t`Норму виконано`;
  const amount = `${formatVolume(leftMl)} ${VOLUME_UNIT}`;
  return t`Ще ${amount}`;
}

/** What is left to eat today, or how far past the goal. */
function kcalNote(leftKcal: number) {
  const unit = t`ккал`;
  if (leftKcal < 0) {
    const over = `${formatKcal(-leftKcal)} ${unit}`;
    return t`На ${over} більше`;
  }
  const amount = `${formatKcal(leftKcal)} ${unit}`;
  return t`Ще ${amount}`;
}

/**
 * Today's water and calories, the next workout, body weight and this week's workouts,
 * formatted for the Android home screen widgets.
 */
export async function loadHomeWidgetData(now = Date.now()) {
  const day = startOfDay(now);
  const [{ waterMl, kcal }, waterGoal, kcalGoal, workout, weight, week] = await Promise.all([
    todayTotals(day),
    getWaterGoal(),
    getKcalGoal(),
    loadWorkout(),
    loadWeight(),
    loadWeek(now),
  ]);
  return {
    day,
    water: {
      label: t`Вода`,
      value: formatVolume(waterMl),
      total: `/ ${formatVolume(waterGoal)} ${VOLUME_UNIT}`,
      progress: waterMl / waterGoal,
      note: waterNote(waterGoal - waterMl),
      startNote: waterNote(waterGoal),
      url: Linking.createURL('water'),
    },
    calories: {
      label: t`Калорії`,
      value: formatKcal(kcal),
      total: `/ ${formatKcal(kcalGoal)} ${t`ккал`}`,
      progress: kcal / kcalGoal,
      over: kcal > kcalGoal,
      note: kcalNote(kcalGoal - kcal),
      startNote: kcalNote(kcalGoal),
      url: Linking.createURL('food'),
    },
    workout,
    weight,
    week,
  };
}

let lastSent: string | null = null;

/** Sends the current data to the home screen widgets, if this build has them and it changed. */
export async function syncHomeWidget() {
  if (!HomeWidget) return;
  const json = JSON.stringify(await loadHomeWidgetData());
  if (json === lastSent) return;
  HomeWidget.update(json);
  lastSent = json;
}
