import { gte, sum } from 'drizzle-orm';
import * as Linking from 'expo-linking';

import { formatKcal } from '@/lib/food';
import { plural, tr } from '@/lib/i18n';
import { notStarted } from '@/lib/metrics';
import { formatVolume, VOLUME_UNIT } from '@/lib/units';
import { startOfDay } from '@/lib/water';
import HomeWidget from '../../modules/home-widget';
import { db } from './client';
import { getKcalGoal } from './food';
import { getActiveProgram, getNextDayId } from './programs';
import { foodEntries, waterIntakes } from './schema';
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
        ? tr('Не розпочато', 'Not started')
        : active.pausedAt
          ? tr('На паузі', 'Paused')
          : tr('Триває', 'In progress'),
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
      label: tr('Наступне тренування', 'Next workout'),
      title: tr('Обери програму', 'Choose a program'),
      subtitle: '',
      url,
    };
  }
  const count = day.exercises.length;
  return {
    label: tr('Наступне тренування', 'Next workout'),
    title: day.name,
    subtitle: `${program.name} · ${count} ${plural(count, ['вправа', 'вправи', 'вправ'], ['exercise', 'exercises'])}`,
    url,
  };
}

/** Today's water and calories and the next workout, formatted for the Android home screen widgets. */
export async function loadHomeWidgetData(now = Date.now()) {
  const day = startOfDay(now);
  const [{ waterMl, kcal }, waterGoal, kcalGoal, workout] = await Promise.all([
    todayTotals(day),
    getWaterGoal(),
    getKcalGoal(),
    loadWorkout(),
  ]);
  return {
    day,
    water: {
      label: tr('Вода', 'Water'),
      value: formatVolume(waterMl),
      total: `/ ${formatVolume(waterGoal)} ${VOLUME_UNIT}`,
      progress: waterMl / waterGoal,
      url: Linking.createURL('water'),
    },
    calories: {
      label: tr('Калорії', 'Calories'),
      value: formatKcal(kcal),
      total: `/ ${formatKcal(kcalGoal)} ${tr('ккал', 'kcal')}`,
      progress: kcal / kcalGoal,
      over: kcal > kcalGoal,
      url: Linking.createURL('food'),
    },
    workout,
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
