import type { WeightReading } from '@/db/body-weight';

export type HealthStatus = 'ok' | 'unavailable' | 'update-required' | 'denied';

/** What a platform's health store (Apple Health, Health Connect) offers the sync. */
export type HealthProvider = {
  /** Whether the store can be used at all, before asking for access. */
  availability(): Promise<Exclude<HealthStatus, 'denied'>>;
  /** Whether read access was already granted, so syncing needs no prompt. */
  hasAccess(): Promise<boolean>;
  /** Shows the system access sheet; resolves to whether access was granted. */
  requestAccess(): Promise<boolean>;
  /** Weighings at or after `since`. */
  read(since: Date): Promise<WeightReading[]>;
  /** Drops granted access where the platform allows it (Health Connect only). */
  revokeAccess(): Promise<void>;
};
