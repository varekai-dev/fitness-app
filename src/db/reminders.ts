import { inArray } from 'drizzle-orm';

import {
  DEFAULT_DAY_WINDOW,
  DEFAULT_WATER_REMINDERS,
  REMINDER_INTERVALS_MIN,
  type DayWindow,
  type WaterReminderSettings,
} from '@/lib/reminders';
import { db } from './client';
import { settings } from './schema';

const KEYS = {
  dayStart: 'day_start_min',
  dayEnd: 'day_end_min',
  waterEnabled: 'water_reminders_enabled',
  waterInterval: 'water_reminders_interval_min',
} as const;

async function read(keys: string[]) {
  const rows = await db.query.settings.findMany({ where: inArray(settings.key, keys) });
  return (key: string) => rows.find((r) => r.key === key)?.value;
}

async function write(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}

const minutes = (value: string | undefined) => {
  const n = Number(value);
  return value && Number.isInteger(n) && n >= 0 && n <= 24 * 60 ? n : null;
};

/** The waking hours shared by every kind of reminder. */
export async function getDayWindow(): Promise<DayWindow> {
  const get = await read([KEYS.dayStart, KEYS.dayEnd]);
  const startMin = minutes(get(KEYS.dayStart)) ?? DEFAULT_DAY_WINDOW.startMin;
  const endMin = minutes(get(KEYS.dayEnd)) ?? DEFAULT_DAY_WINDOW.endMin;
  return endMin > startMin ? { startMin, endMin } : DEFAULT_DAY_WINDOW;
}

export async function setDayWindow({ startMin, endMin }: DayWindow) {
  await write({ [KEYS.dayStart]: String(startMin), [KEYS.dayEnd]: String(endMin) });
}

export async function getWaterReminders(): Promise<WaterReminderSettings> {
  const get = await read([KEYS.waterEnabled, KEYS.waterInterval]);
  const interval = REMINDER_INTERVALS_MIN.find((m) => String(m) === get(KEYS.waterInterval));
  return {
    enabled: get(KEYS.waterEnabled) === '1',
    intervalMin: interval ?? DEFAULT_WATER_REMINDERS.intervalMin,
  };
}

export async function setWaterReminders(next: Partial<WaterReminderSettings>) {
  await write({
    ...(next.enabled !== undefined && { [KEYS.waterEnabled]: next.enabled ? '1' : '0' }),
    ...(next.intervalMin !== undefined && { [KEYS.waterInterval]: String(next.intervalMin) }),
  });
}
