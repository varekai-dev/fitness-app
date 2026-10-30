import { t } from '@lingui/core/macro';
import type { IconName } from '@/components/ui';

export const WIDGET_SIZES = ['small', 'medium', 'large'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  small: t`Малий`,
  medium: t`Середній`,
  large: t`Великий`,
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
  'stat-workouts-week': {
    title: t`Тренувань за тиждень`,
    icon: 'barbell',
  },
  'stat-workouts-kcal': { title: t`Спалено за тиждень`, icon: 'barbell' },
  'stat-workouts-total': { title: t`Усього тренувань`, icon: 'barbell' },
  'stat-workouts-time': {
    title: t`Час тренувань за тиждень`,
    icon: 'barbell',
  },
  'stat-workouts-volume': { title: t`Тоннаж за тиждень`, icon: 'barbell' },
  'stat-workouts-streak': { title: t`Тижнів поспіль`, icon: 'barbell' },
  'stat-workouts-since': {
    title: t`Від останнього тренування`,
    icon: 'barbell',
  },
  'stat-food-left': { title: t`Лишилось ккал`, icon: 'restaurant' },
  'stat-food-protein': { title: t`Білок сьогодні`, icon: 'restaurant' },
  'stat-food-average': { title: t`Ккал у середньому`, icon: 'restaurant' },
  'stat-food-streak': { title: t`Днів у межах цілі`, icon: 'restaurant' },
  'stat-food-balance': { title: t`Баланс калорій`, icon: 'restaurant' },
  'stat-water-today': { title: t`Вода сьогодні`, icon: 'water' },
  'stat-water-average': { title: t`Вода в середньому`, icon: 'water' },
  'stat-water-goal-days': { title: t`Днів з ціллю`, icon: 'water' },
  'stat-water-streak': { title: t`Днів поспіль`, icon: 'water' },
};

export const isStatType = (type: WidgetType): type is StatType =>
  (STAT_TYPES as readonly string[]).includes(type);

export const WIDGET_INFO: Record<
  Exclude<WidgetType, StatType>,
  { title: string; description: string; icon: IconName }
> = {
  quote: {
    title: t`Цитата дня`,
    description: t`Мотиваційна фраза, щодня нова.`,
    icon: 'flash',
  },
  'workout-next': {
    title: t`Наступне тренування`,
    description: t`День програми, який іде далі, або тренування, що триває. Старт одним дотиком.`,
    icon: 'play-circle',
  },
  'workout-week': {
    title: t`Тиждень тренувань`,
    description: t`Скільки тренувань цього тижня, спалені калорії та дні активності.`,
    icon: 'flame',
  },
  'food-calories': {
    title: t`Калорії`,
    description: t`З’їдено за сьогодні проти цілі, білки, жири й вуглеводи.`,
    icon: 'restaurant',
  },
  'food-meals': {
    title: t`Прийоми їжі`,
    description: t`Що вже з’їдено сьогодні, з калоріями кожної страви.`,
    icon: 'list',
  },
  'water-today': {
    title: t`Вода сьогодні`,
    description: t`Випито за день і швидке додавання склянок.`,
    icon: 'water',
  },
  'water-week': {
    title: t`Вода за тиждень`,
    description: t`Скільки випито в кожен з останніх 7 днів і в які дні ціль виконано.`,
    icon: 'bar-chart',
  },
  weight: {
    title: t`Вага тіла`,
    description: t`Остання вага, зміна з попереднього зважування і графік.`,
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
    title: t`Тренування`,
    types: ['workout-next', 'workout-week'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-workouts-')),
  },
  {
    title: t`Харчування`,
    types: ['food-calories', 'food-meals'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-food-')),
  },
  {
    title: t`Вода`,
    types: ['water-today', 'water-week'],
    stats: STAT_TYPES.filter((t) => t.startsWith('stat-water-')),
  },
  { title: t`Тіло`, types: ['weight'], stats: [] },
  { title: t`Інше`, types: ['quote'], stats: [] },
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
