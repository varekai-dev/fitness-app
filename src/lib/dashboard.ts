import type { IconName } from '@/components/ui';

export const WIDGET_SIZES = ['small', 'medium', 'large'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  small: 'Малий',
  medium: 'Середній',
  large: 'Великий',
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
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export type Widget = { id: string; type: WidgetType; size: WidgetSize };

export const STAT_INFO: Record<StatType, { title: string; icon: IconName }> = {
  'stat-workouts-week': { title: 'Тренувань за тиждень', icon: 'flame' },
  'stat-workouts-kcal': { title: 'Спалено за тиждень', icon: 'bonfire' },
  'stat-workouts-total': { title: 'Усього тренувань', icon: 'trophy' },
  'stat-workouts-time': { title: 'Час тренувань за тиждень', icon: 'time' },
  'stat-workouts-volume': { title: 'Тоннаж за тиждень', icon: 'barbell' },
  'stat-workouts-streak': { title: 'Тижнів поспіль', icon: 'ribbon' },
  'stat-workouts-since': { title: 'Від останнього тренування', icon: 'hourglass' },
  'stat-food-left': { title: 'Лишилось ккал', icon: 'restaurant' },
  'stat-food-protein': { title: 'Білок сьогодні', icon: 'nutrition' },
  'stat-food-average': { title: 'Ккал у середньому', icon: 'stats-chart' },
  'stat-food-streak': { title: 'Днів у межах цілі', icon: 'checkmark-circle' },
  'stat-food-balance': { title: 'Баланс калорій', icon: 'swap-vertical' },
  'stat-water-today': { title: 'Вода сьогодні', icon: 'water' },
  'stat-water-average': { title: 'Вода в середньому', icon: 'stats-chart' },
  'stat-water-goal-days': { title: 'Днів з ціллю', icon: 'calendar' },
  'stat-water-streak': { title: 'Днів поспіль', icon: 'ribbon' },
};

export const isStatType = (type: WidgetType): type is StatType =>
  (STAT_TYPES as readonly string[]).includes(type);

export const WIDGET_INFO: Record<
  Exclude<WidgetType, StatType>,
  { title: string; description: string; icon: IconName }
> = {
  quote: {
    title: 'Цитата дня',
    description: 'Мотиваційна фраза, щодня нова.',
    icon: 'flash',
  },
  'workout-next': {
    title: 'Наступне тренування',
    description: 'День програми, який іде далі, або тренування, що триває. Старт одним дотиком.',
    icon: 'play-circle',
  },
  'workout-week': {
    title: 'Тиждень тренувань',
    description: 'Скільки тренувань цього тижня, спалені калорії та дні активності.',
    icon: 'flame',
  },
  'food-calories': {
    title: 'Калорії',
    description: 'З’їдено за сьогодні проти цілі, білки, жири й вуглеводи.',
    icon: 'restaurant',
  },
  'food-meals': {
    title: 'Прийоми їжі',
    description: 'Що вже з’їдено сьогодні, з калоріями кожної страви.',
    icon: 'list',
  },
  'water-today': {
    title: 'Вода сьогодні',
    description: 'Випито за день і швидке додавання склянок.',
    icon: 'water',
  },
  'water-week': {
    title: 'Вода за тиждень',
    description: 'Скільки випито в кожен з останніх 7 днів і в які дні ціль виконано.',
    icon: 'bar-chart',
  },
  weight: {
    title: 'Вага тіла',
    description: 'Остання вага, зміна з попереднього зважування і графік.',
    icon: 'scale',
  },
};

/** The picker lists widgets, then stat tiles, under the tab they belong to. */
export const WIDGET_GROUPS: {
  title: string;
  types: Exclude<WidgetType, StatType>[];
  stats: StatType[];
}[] = [
  {
    title: 'Тренування',
    types: ['workout-next', 'workout-week'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-workouts-')),
  },
  {
    title: 'Харчування',
    types: ['food-calories', 'food-meals'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-food-')),
  },
  {
    title: 'Вода',
    types: ['water-today', 'water-week'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-water-')),
  },
  { title: 'Тіло', types: ['weight'], stats: [] },
  { title: 'Інше', types: ['quote'], stats: [] },
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
