import type { IconName } from '@/components/ui';

export const WIDGET_SIZES = ['small', 'medium', 'large'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  small: 'Малий',
  medium: 'Середній',
  large: 'Великий',
};

export const WIDGET_TYPES = [
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

export const WIDGET_INFO: Record<
  WidgetType,
  { title: string; description: string; icon: IconName }
> = {
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

/** The picker lists widgets under the tab they belong to. */
export const WIDGET_GROUPS: { title: string; types: WidgetType[] }[] = [
  { title: 'Тренування', types: ['workout-next', 'workout-week'] },
  { title: 'Харчування', types: ['food-calories', 'food-meals'] },
  { title: 'Вода', types: ['water-today', 'water-week'] },
  { title: 'Тіло', types: ['weight'] },
];

export const newWidgetId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** What a fresh install shows: roughly the old fixed home screen. */
export const DEFAULT_DASHBOARD: Widget[] = [
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

/** The next size when the size button is tapped in edit mode. */
export const nextSize = (size: WidgetSize): WidgetSize =>
  WIDGET_SIZES[(WIDGET_SIZES.indexOf(size) + 1) % WIDGET_SIZES.length];
