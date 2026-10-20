import type { IconName } from '@/components/ui';
import { tr } from '@/lib/i18n';

export const WIDGET_SIZES = ['small', 'medium', 'large'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  small: tr('Малий', 'Small'),
  medium: tr('Середній', 'Medium'),
  large: tr('Великий', 'Large'),
};

/** One-number tiles, a third of the row wide, like the Training tab's stats. */
export const STAT_TYPES = [
  'stat-workouts-week',
  'stat-workouts-kcal',
  'stat-workouts-total',
  'stat-workouts-time',
  'stat-workouts-volume',
  'stat-workouts-streak',
  'stat-workouts-since',
  'stat-food-left',
  'stat-food-protein',
  'stat-food-average',
  'stat-food-streak',
  'stat-food-balance',
  'stat-water-today',
  'stat-water-average',
  'stat-water-goal-days',
  'stat-water-streak',
] as const;
export type StatType = (typeof STAT_TYPES)[number];

export const WIDGET_TYPES = [
  ...STAT_TYPES,
  'quote',
  'workout-next',
  'workout-week',
  'food-calories',
  'food-meals',
  'water-today',
  'water-week',
  'weight',
  'steps',
  'sleep',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export type Widget = { id: string; type: WidgetType; size: WidgetSize };

export const STAT_INFO: Record<StatType, { title: string; icon: IconName }> = {
  'stat-workouts-week': {
    title: tr('Тренувань за тиждень', 'Workouts this week'),
    icon: 'barbell',
  },
  'stat-workouts-kcal': { title: tr('Спалено за тиждень', 'Burned this week'), icon: 'barbell' },
  'stat-workouts-total': { title: tr('Усього тренувань', 'Total workouts'), icon: 'barbell' },
  'stat-workouts-time': {
    title: tr('Час тренувань за тиждень', 'Workout time this week'),
    icon: 'barbell',
  },
  'stat-workouts-volume': { title: tr('Тоннаж за тиждень', 'Volume this week'), icon: 'barbell' },
  'stat-workouts-streak': { title: tr('Тижнів поспіль', 'Weeks in a row'), icon: 'barbell' },
  'stat-workouts-since': {
    title: tr('Від останнього тренування', 'Since last workout'),
    icon: 'barbell',
  },
  'stat-food-left': { title: tr('Лишилось ккал', 'Kcal left'), icon: 'restaurant' },
  'stat-food-protein': { title: tr('Білок сьогодні', 'Protein today'), icon: 'restaurant' },
  'stat-food-average': { title: tr('Ккал у середньому', 'Average kcal'), icon: 'restaurant' },
  'stat-food-streak': { title: tr('Днів у межах цілі', 'Days within goal'), icon: 'restaurant' },
  'stat-food-balance': { title: tr('Баланс калорій', 'Calorie balance'), icon: 'restaurant' },
  'stat-water-today': { title: tr('Вода сьогодні', 'Water today'), icon: 'water' },
  'stat-water-average': { title: tr('Вода в середньому', 'Average water'), icon: 'water' },
  'stat-water-goal-days': { title: tr('Днів з ціллю', 'Days at goal'), icon: 'water' },
  'stat-water-streak': { title: tr('Днів поспіль', 'Days in a row'), icon: 'water' },
};

export const isStatType = (type: WidgetType): type is StatType =>
  (STAT_TYPES as readonly string[]).includes(type);

export const WIDGET_INFO: Record<
  Exclude<WidgetType, StatType>,
  { title: string; description: string; icon: IconName }
> = {
  quote: {
    title: tr('Цитата дня', 'Quote of the day'),
    description: tr('Мотиваційна фраза, щодня нова.', 'A motivational phrase, new every day.'),
    icon: 'flash',
  },
  'workout-next': {
    title: tr('Наступне тренування', 'Next workout'),
    description: tr(
      'День програми, який іде далі, або тренування, що триває. Старт одним дотиком.',
      'The next program day, or the workout in progress. Start with one tap.',
    ),
    icon: 'play-circle',
  },
  'workout-week': {
    title: tr('Тиждень тренувань', 'Training week'),
    description: tr(
      'Скільки тренувань цього тижня, спалені калорії та дні активності.',
      'Workouts this week, calories burned and active days.',
    ),
    icon: 'flame',
  },
  'food-calories': {
    title: tr('Калорії', 'Calories'),
    description: tr(
      'З’їдено за сьогодні проти цілі, білки, жири й вуглеводи.',
      'Eaten today against your goal, with protein, fat and carbs.',
    ),
    icon: 'restaurant',
  },
  'food-meals': {
    title: tr('Прийоми їжі', 'Meals'),
    description: tr(
      'Що вже з’їдено сьогодні, з калоріями кожної страви.',
      'What you’ve eaten today, with the calories of each dish.',
    ),
    icon: 'list',
  },
  'water-today': {
    title: tr('Вода сьогодні', 'Water today'),
    description: tr(
      'Випито за день і швидке додавання склянок.',
      'Drunk today, with quick buttons to add a glass.',
    ),
    icon: 'water',
  },
  'water-week': {
    title: tr('Вода за тиждень', 'Water this week'),
    description: tr(
      'Скільки випито в кожен з останніх 7 днів і в які дні ціль виконано.',
      'How much you drank on each of the last 7 days, and which days hit the goal.',
    ),
    icon: 'bar-chart',
  },
  weight: {
    title: tr('Вага тіла', 'Body weight'),
    description: tr(
      'Остання вага, зміна з попереднього зважування і графік.',
      'Latest weight, change since the previous weigh-in, and a chart.',
    ),
    icon: 'scale',
  },
  steps: {
    title: tr('Кроки', 'Steps'),
    description: tr(
      'Кроки за сьогодні проти цілі й за останні 7 днів, з Health Connect або Apple Health.',
      'Steps today against the goal and over the last 7 days, from Health Connect or Apple Health.',
    ),
    icon: 'footsteps',
  },
  sleep: {
    title: tr('Сон', 'Sleep'),
    description: tr(
      'Скільки спав минулої ночі й за останні 7 ночей, з Health Connect або Apple Health.',
      'How long you slept last night and over the last 7 nights, from Health Connect or Apple Health.',
    ),
    icon: 'moon',
  },
};

/** The picker lists widgets, then stat tiles, under the tab they belong to. */
export const WIDGET_GROUPS: {
  title: string;
  types: Exclude<WidgetType, StatType>[];
  stats: StatType[];
}[] = [
  {
    title: tr('Тренування', 'Training'),
    types: ['workout-next', 'workout-week'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-workouts-')),
  },
  {
    title: tr('Харчування', 'Food'),
    types: ['food-calories', 'food-meals'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-food-')),
  },
  {
    title: tr('Вода', 'Water'),
    types: ['water-today', 'water-week'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-water-')),
  },
  { title: tr('Тіло', 'Body'), types: ['weight'], stats: [] },
  { title: tr('Активність і сон', 'Activity and sleep'), types: ['steps', 'sleep'], stats: [] },
  { title: tr('Інше', 'Other'), types: ['quote'], stats: [] },
];

export const newWidgetId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** What a fresh install shows: roughly the old fixed home screen. */
export const DEFAULT_DASHBOARD: Widget[] = [
  { id: 'default-quote', type: 'quote', size: 'medium' },
  { id: 'default-workout', type: 'workout-next', size: 'medium' },
  { id: 'default-food', type: 'food-calories', size: 'small' },
  { id: 'default-water', type: 'water-today', size: 'small' },
  { id: 'default-weight', type: 'weight', size: 'medium' },
];

const isWidget = (w: unknown): w is Widget => {
  const v = w as Widget;
  return (
    !!v &&
    typeof v.id === 'string' &&
    (WIDGET_TYPES as readonly string[]).includes(v.type) &&
    (WIDGET_SIZES as readonly string[]).includes(v.size)
  );
};

/** Saved layout, dropping anything an older or newer app version wrote that this one can't draw. */
export function parseDashboard(json: string | undefined): Widget[] {
  if (json === undefined) return DEFAULT_DASHBOARD;
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(isWidget) : DEFAULT_DASHBOARD;
  } catch {
    return DEFAULT_DASHBOARD;
  }
}

/** Widgets with no size choice: the quote and the stat tiles. */
export const isFixedSize = (type: WidgetType) => type === 'quote' || isStatType(type);

/** The next size when the size button is tapped in edit mode. */
export const nextSize = (size: WidgetSize): WidgetSize =>
  WIDGET_SIZES[(WIDGET_SIZES.indexOf(size) + 1) % WIDGET_SIZES.length];
