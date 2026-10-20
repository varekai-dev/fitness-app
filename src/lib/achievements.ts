import type { IconName } from '@/components/ui';
import type { AchievementData } from '@/db/achievements';
import type { TrackingType } from '@/db/schema';
import { plural, tr } from '@/lib/i18n';
import { startOfWeek } from '@/lib/labels';
import { formatTonnage, workoutDurationMs, type SetValues } from '@/lib/metrics';
import { computeProgress } from '@/lib/progress';
import { totalsByDay } from '@/lib/stats';
import { formatVolumeCompact } from '@/lib/units';
import { addDays, startOfDay } from '@/lib/water';

export const ACHIEVEMENT_GROUPS = ['training', 'food', 'water', 'body'] as const;
export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];

/** The value reached at `at`; a timeline only ever grows, oldest first. */
type Point = { at: number; value: number };

type Achievement = {
  id: string;
  group: AchievementGroup;
  icon: IconName;
  title: string;
  /** Each level's target, ascending. */
  levels: number[];
  /** What a level asks for: "10 тренувань". */
  goal: (target: number) => string;
  /** A value in the units of `goal`, for "34 / 50". */
  format?: (value: number) => string;
  timeline: (d: AchievementData, now: number) => Point[];
};

export type AchievementProgress = {
  achievement: Achievement;
  value: number;
  /** Levels reached, 0 to `levels.length`. */
  level: number;
  /** When each level was reached, null while it isn't. */
  unlockedAt: (number | null)[];
};

type FinishedWorkout = AchievementData['workouts'][number];

const oldestFirst = (times: number[]) => [...times].sort((a, b) => a - b);

/** A running total over events. */
function cumulative(events: { at: number; amount: number }[]): Point[] {
  let value = 0;
  return [...events]
    .sort((a, b) => a.at - b.at)
    .map((e) => ({ at: e.at, value: (value += e.amount) }));
}

const count = (times: number[]) => cumulative(times.map((at) => ({ at, amount: 1 })));

/** The longest run so far of consecutive periods, given each period's start and the next one's. */
function bestRun(starts: number[], next: (start: number) => number): Point[] {
  const sorted = [...new Set(starts)].sort((a, b) => a - b);
  const points: Point[] = [];
  let run = 0;
  let best = 0;
  let prev: number | null = null;
  for (const s of sorted) {
    run = prev !== null && next(prev) === s ? run + 1 : 1;
    prev = s;
    if (run > best) {
      best = run;
      points.push({ at: s, value: best });
    }
  }
  return points;
}

const dayRun = (days: number[]) => bestRun(days.map(startOfDay), (d) => addDays(d, 1));
const weekRun = (times: number[]) =>
  bestRun(times.map(startOfWeek), (w) => startOfWeek(addDays(w, 7)));

const doneSets = (e: FinishedWorkout['exercises'][number]) =>
  e.sets.filter((s) => s.completedAt !== null);

const isWeighted = (t: TrackingType) => t === 'weight_reps' || t === 'weighted_reps';

function tonnageKg(w: FinishedWorkout) {
  let kg = 0;
  for (const e of w.exercises) {
    if (!isWeighted(e.exercise.trackingType)) continue;
    for (const s of doneSets(e)) kg += (s.weightKg ?? 0) * (s.reps ?? 0);
  }
  return kg;
}

/** When each personal record was set; an exercise's first session is no record. */
function recordTimes(workouts: FinishedWorkout[]) {
  const sessions = new Map<
    number,
    { type: TrackingType; list: { workoutId: number; date: number; sets: SetValues[] }[] }
  >();
  for (const w of workouts) {
    for (const e of w.exercises) {
      const sets = doneSets(e);
      if (sets.length === 0) continue;
      const entry = sessions.get(e.exerciseId) ?? { type: e.exercise.trackingType, list: [] };
      entry.list.push({ workoutId: w.id, date: w.startedAt, sets });
      sessions.set(e.exerciseId, entry);
    }
  }
  return [...sessions.values()].flatMap(({ type, list }) =>
    computeProgress(type, list)
      .slice(1)
      .filter((p) => p.isPR)
      .map((p) => p.date),
  );
}

const hourOf = (ms: number) => new Date(ms).getHours();
const HOUR_MS = 3_600_000;

/** Days whose total meets `hit`, as their local midnights. */
const daysWhere = (totals: Map<number, number>, hit: (total: number, day: number) => boolean) =>
  oldestFirst([...totals].filter(([day, total]) => hit(total, day)).map(([day]) => day));

const foodTotals = (d: AchievementData) => totalsByDay(d.food, (e) => e.eatenAt, (e) => e.kcal);
const waterTotals = (d: AchievementData) =>
  totalsByDay(d.water, (i) => i.drankAt, (i) => i.amountMl);

const workouts = (n: number) =>
  `${n} ${plural(n, ['тренування', 'тренування', 'тренувань'], ['workout', 'workouts'])}`;
const days = (n: number) => `${n} ${plural(n, ['день', 'дні', 'днів'], ['day', 'days'])}`;
const tonnage = (kg: number) => {
  const t = formatTonnage(kg);
  return `${t.value} ${t.unit}`;
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'workouts',
    group: 'training',
    icon: 'barbell',
    title: tr('Завсідник', 'Regular'),
    levels: [1, 10, 50, 100, 250, 500],
    goal: workouts,
    timeline: (d) => count(d.workouts.map((w) => w.startedAt)),
  },
  {
    id: 'week-streak',
    group: 'training',
    icon: 'calendar',
    title: tr('Без пропусків', 'No week missed'),
    levels: [2, 4, 12, 26, 52],
    goal: (n) =>
      `${n} ${plural(n, ['тиждень', 'тижні', 'тижнів'], ['week', 'weeks'])} ${tr('поспіль з тренуванням', 'in a row with a workout')}`,
    timeline: (d) => weekRun(d.workouts.map((w) => w.startedAt)),
  },
  {
    id: 'tonnage',
    group: 'training',
    icon: 'cube',
    title: tr('Важкоатлет', 'Heavy lifter'),
    levels: [1_000, 10_000, 100_000, 500_000, 1_000_000],
    goal: (kg) => `${tonnage(kg)} ${tr('сумарного тоннажу', 'lifted in total')}`,
    format: tonnage,
    timeline: (d) => cumulative(d.workouts.map((w) => ({ at: w.startedAt, amount: tonnageKg(w) }))),
  },
  {
    id: 'hours',
    group: 'training',
    icon: 'time',
    title: tr('Час під штангою', 'Time under the bar'),
    levels: [10, 50, 100, 250, 500].map((h) => h * HOUR_MS),
    goal: (ms) => `${ms / HOUR_MS} ${tr('год тренувань', 'h of training')}`,
    format: (ms) => `${Math.floor((ms / HOUR_MS) * 10) / 10} ${tr('год', 'h')}`,
    timeline: (d) =>
      cumulative(
        d.workouts.map((w) => ({
          at: w.startedAt,
          amount: workoutDurationMs(w, w.finishedAt ?? w.startedAt),
        })),
      ),
  },
  {
    id: 'records',
    group: 'training',
    icon: 'trophy',
    title: tr('Рекордсмен', 'Record breaker'),
    levels: [1, 10, 50, 100, 250],
    goal: (n) =>
      `${n} ${plural(n, ['особистий рекорд', 'особисті рекорди', 'особистих рекордів'], ['personal record', 'personal records'])}`,
    timeline: (d) => count(recordTimes(d.workouts)),
  },
  {
    id: 'early-bird',
    group: 'training',
    icon: 'sunny',
    title: tr('Рання пташка', 'Early bird'),
    levels: [1, 10, 50],
    goal: (n) => `${workouts(n)} ${tr('до 7:00', 'before 7:00')}`,
    timeline: (d) => count(d.workouts.map((w) => w.startedAt).filter((t) => hourOf(t) < 7)),
  },
  {
    id: 'night-owl',
    group: 'training',
    icon: 'moon',
    title: tr('Нічна сова', 'Night owl'),
    levels: [1, 10, 50],
    goal: (n) => `${workouts(n)} ${tr('після 21:00', 'after 21:00')}`,
    timeline: (d) => count(d.workouts.map((w) => w.startedAt).filter((t) => hourOf(t) >= 21)),
  },
  {
    id: 'food-days',
    group: 'food',
    icon: 'restaurant',
    title: tr('Щоденник', 'Food diary'),
    levels: [1, 7, 30, 100, 365],
    goal: (n) => `${days(n)} ${tr('із записами їжі', 'with food logged')}`,
    timeline: (d) => count([...foodTotals(d).keys()]),
  },
  {
    id: 'food-streak',
    group: 'food',
    icon: 'flame',
    title: tr('Звичка', 'Habit'),
    levels: [3, 7, 30, 100],
    goal: (n) => `${days(n)} ${tr('поспіль із записами їжі', 'in a row with food logged')}`,
    timeline: (d) => dayRun([...foodTotals(d).keys()]),
  },
  {
    id: 'kcal-goal',
    group: 'food',
    icon: 'checkmark-circle',
    title: tr('У межах', 'On target'),
    levels: [1, 10, 50, 100, 365],
    goal: (n) => `${days(n)} ${tr('у межах норми калорій', 'within the calorie goal')}`,
    // Only finished days: today can still go over.
    timeline: (d, now) =>
      count(daysWhere(foodTotals(d), (k, day) => k > 0 && k <= d.kcalGoal && day < startOfDay(now))),
  },
  {
    id: 'water-days',
    group: 'water',
    icon: 'water',
    title: tr('Водний баланс', 'Hydrated'),
    levels: [1, 7, 30, 100, 365],
    goal: (n) => `${days(n)} ${tr('з нормою води', 'at the water goal')}`,
    timeline: (d) => count(daysWhere(waterTotals(d), (ml) => ml >= d.waterGoal)),
  },
  {
    id: 'water-streak',
    group: 'water',
    icon: 'repeat',
    title: tr('Як годинник', 'Like clockwork'),
    levels: [3, 7, 30, 100],
    goal: (n) => `${days(n)} ${tr('поспіль з нормою води', 'in a row at the water goal')}`,
    timeline: (d) => dayRun(daysWhere(waterTotals(d), (ml) => ml >= d.waterGoal)),
  },
  {
    id: 'water-total',
    group: 'water',
    icon: 'boat',
    title: tr('Океан', 'Ocean'),
    levels: [100_000, 500_000, 1_000_000, 2_000_000],
    goal: (ml) => `${formatVolumeCompact(ml)} ${tr('випито', 'drunk')}`,
    format: formatVolumeCompact,
    timeline: (d) => cumulative(d.water.map((i) => ({ at: i.drankAt, amount: i.amountMl }))),
  },
  {
    id: 'weigh-ins',
    group: 'body',
    icon: 'scale',
    title: tr('На вагах', 'On the scale'),
    levels: [1, 10, 30, 100, 365],
    goal: (n) =>
      `${n} ${plural(n, ['зважування', 'зважування', 'зважувань'], ['weigh-in', 'weigh-ins'])}`,
    timeline: (d) => count(d.weighIns),
  },
  {
    id: 'photos',
    group: 'body',
    icon: 'camera',
    title: tr('Фотохроніка', 'Photo diary'),
    levels: [1, 10, 30, 100],
    goal: (n) =>
      `${n} ${plural(n, ['фото', 'фото', 'фото'], ['photo', 'photos'])} ${tr('прогресу', 'of progress')}`,
    timeline: (d) => count(d.photos),
  },
];

export const GROUP_INFO: Record<AchievementGroup, { title: string; icon: IconName }> = {
  training: { title: tr('Тренування', 'Training'), icon: 'barbell' },
  food: { title: tr('Харчування', 'Food'), icon: 'restaurant' },
  water: { title: tr('Вода', 'Water'), icon: 'water' },
  body: { title: tr('Тіло', 'Body'), icon: 'body' },
};

export function computeAchievements(
  data: AchievementData,
  groups: readonly AchievementGroup[],
  now = Date.now(),
): AchievementProgress[] {
  return ACHIEVEMENTS.filter((a) => groups.includes(a.group)).map((achievement) => {
    const points = achievement.timeline(data, now);
    const unlockedAt = achievement.levels.map(
      (target) => points.find((p) => p.value >= target)?.at ?? null,
    );
    return {
      achievement,
      value: points.at(-1)?.value ?? 0,
      level: unlockedAt.filter((t) => t !== null).length,
      unlockedAt,
    };
  });
}

/** Levels reached across all achievements, and how many there are. */
export function achievementTotals(list: AchievementProgress[]) {
  return {
    unlocked: list.reduce((n, p) => n + p.level, 0),
    total: list.reduce((n, p) => n + p.achievement.levels.length, 0),
  };
}

/** Levels reached since the user last looked, per achievement. */
export function newLevels(list: AchievementProgress[], seen: Record<string, number>) {
  return list.reduce((n, p) => n + Math.max(0, p.level - (seen[p.achievement.id] ?? 0)), 0);
}
