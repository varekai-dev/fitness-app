import { useSyncExternalStore } from 'react';

import type { IconName } from '@/components/ui';
import { readSettingSync, writeSettingSync } from '@/lib/app-settings';
import type { WidgetType } from '@/lib/dashboard';
import { tr } from '@/lib/i18n';

/** Parts of the app the user can switch off and reorder. Each one is a tab; this is the default order. */
export const MODULES = ['home', 'training', 'food', 'water'] as const;
export type AppModule = (typeof MODULES)[number];

export const MODULE_INFO: Record<
  AppModule,
  { title: string; description: string; icon: IconName; route: string }
> = {
  home: {
    title: tr('Головна', 'Home'),
    description: tr(
      'Дашборд з віджетами з усіх розділів.',
      'A dashboard of widgets from every section.',
    ),
    icon: 'home',
    route: 'index',
  },
  training: {
    title: tr('Тренування', 'Training'),
    description: tr(
      'Програми, вправи, плеєр тренувань та історія.',
      'Programs, exercises, the workout player and history.',
    ),
    icon: 'barbell',
    route: 'training',
  },
  food: {
    title: tr('Харчування', 'Food'),
    description: tr(
      'Щоденник їжі, калорії, макроси та AI-поради.',
      'Food diary, calories, macros and AI advice.',
    ),
    icon: 'restaurant',
    route: 'food',
  },
  water: {
    title: tr('Вода', 'Water'),
    description: tr(
      'Облік випитого, денна ціль і нагадування пити.',
      'Drink log, daily goal and reminders to drink.',
    ),
    icon: 'water',
    route: 'water',
  },
};

const DISABLED_KEY = 'disabled_modules';
const ORDER_KEY = 'modules_order';

const parseList = (key: string): AppModule[] => {
  try {
    const parsed: unknown = JSON.parse(readSettingSync(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((m): m is AppModule => (MODULES as readonly unknown[]).includes(m))
      : [];
  } catch {
    return [];
  }
};

function readDisabled() {
  const list = parseList(DISABLED_KEY);
  // Someone has to stay: a list with everything off is ignored.
  return list.length < MODULES.length ? list : [];
}

/** The saved order, with any module it lacks (say, one added in an update) at the end. */
function readOrder() {
  const saved = [...new Set(parseList(ORDER_KEY))];
  return [...saved, ...MODULES.filter((m) => !saved.includes(m))];
}

let disabled = readDisabled();
let order = readOrder();
let enabled = order.filter((m) => !disabled.includes(m));
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const changed = () => {
  enabled = order.filter((m) => !disabled.includes(m));
  listeners.forEach((l) => l());
};

/** Modules that are on, in tab order. Never empty. */
export const getEnabledModules = (): readonly AppModule[] => enabled;

/** Every module, on or off, in tab order. */
export const getModuleOrder = (): readonly AppModule[] => order;

export const isModuleEnabled = (module: AppModule) => enabled.includes(module);

/** Re-renders when a module is switched on or off, or moved. */
export function useEnabledModules() {
  return useSyncExternalStore(subscribe, getEnabledModules);
}

/** Re-renders when the modules are reordered. */
export function useModuleOrder() {
  return useSyncExternalStore(subscribe, getModuleOrder);
}

/** Switches a module on or off. The last enabled module can't be switched off. */
export function setModuleEnabled(module: AppModule, on: boolean) {
  if (on === enabled.includes(module)) return;
  if (!on && enabled.length === 1) return;
  disabled = on ? disabled.filter((m) => m !== module) : [...disabled, module];
  writeSettingSync(DISABLED_KEY, disabled.length ? JSON.stringify(disabled) : null);
  changed();
}

/** Puts the modules, and so the tabs, in a new order. */
export function setModuleOrder(next: readonly AppModule[]) {
  if (next.length !== MODULES.length || next.every((m, i) => m === order[i])) return;
  order = [...next];
  const isDefault = order.every((m, i) => m === MODULES[i]);
  writeSettingSync(ORDER_KEY, isDefault ? null : JSON.stringify(order));
  changed();
}

/** The module a dashboard widget belongs to; null for the ones that fit anywhere. */
export function widgetModule(type: WidgetType): AppModule | null {
  if (type.startsWith('stat-workouts-') || type.startsWith('workout-')) return 'training';
  if (type.startsWith('stat-food-') || type.startsWith('food-')) return 'food';
  if (type.startsWith('stat-water-') || type.startsWith('water-')) return 'water';
  return null;
}

export const isWidgetAvailable = (type: WidgetType) => {
  const module = widgetModule(type);
  return module === null || isModuleEnabled(module);
};
