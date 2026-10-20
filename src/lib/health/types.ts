import type { ActivityReading } from '@/db/activities';
import type { WeightReading } from '@/db/body-weight';
import type { DailyHealthReading } from '@/db/daily-health';

export type HealthStatus = 'ok' | 'unavailable' | 'update-required' | 'denied';

export type HealthReadings = {
  weights: WeightReading[];
  activities: ActivityReading[];
  /** Steps and sleep per day, from the day of `since` (within `DAILY_HISTORY_DAYS`) to today. */
  days: DailyHealthReading[];
};

/** What a platform's health store (Apple Health, Health Connect) offers the sync. */
export type HealthProvider = {
  /** Whether the store can be used at all, before asking for access. */
  availability(): Promise<Exclude<HealthStatus, 'denied'>>;
  /** Whether read access was already granted, so syncing needs no prompt. */
  hasAccess(): Promise<boolean>;
  /** Shows the system access sheet; resolves to whether access was granted. */
  requestAccess(): Promise<boolean>;
  /** Weighings and sessions starting at or after `since`, and daily steps and sleep. */
  read(since: Date): Promise<HealthReadings>;
  /** Drops granted access where the platform allows it (Health Connect only). */
  revokeAccess(): Promise<void>;
};
