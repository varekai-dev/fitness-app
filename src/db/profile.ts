import { desc, eq, like } from 'drizzle-orm';

import {
  ACTIVITY_LEVELS,
  SEXES,
  WEIGHT_GOALS,
  type ActivityLevel,
  type Profile,
  type Sex,
  type WeightGoal,
} from '@/lib/profile';
import { db } from './client';
import { bodyWeights, settings } from './schema';

const PREFIX = 'profile_';
type ProfileKey = keyof Profile;

const oneOf = <T extends string>(options: readonly T[], value: string | undefined) =>
  options.find((o) => o === value);

/** Profile fields live in the settings table as `profile_<field>` rows. */
export async function getProfile(): Promise<Profile> {
  const rows = await db.query.settings.findMany({ where: like(settings.key, `${PREFIX}%`) });
  const get = (key: ProfileKey) => rows.find((r) => r.key === PREFIX + key)?.value;
  const height = Number(get('heightCm'));
  const target = Number(get('targetWeightKg'));
  return {
    heightCm: Number.isFinite(height) && height > 0 ? height : null,
    birthDate: get('birthDate') ?? null,
    sex: oneOf<Sex>(SEXES, get('sex')) ?? null,
    activity: oneOf<ActivityLevel>(ACTIVITY_LEVELS, get('activity')) ?? 'moderate',
    goal: oneOf<WeightGoal>(WEIGHT_GOALS, get('goal')) ?? 'maintain',
    targetWeightKg: Number.isFinite(target) && target > 0 ? target : null,
  };
}

export async function setProfileField<K extends ProfileKey>(key: K, value: Profile[K]) {
  const row = { key: PREFIX + key, value: value === null ? '' : String(value) };
  if (value === null) {
    await db.delete(settings).where(eq(settings.key, row.key));
    return;
  }
  await db
    .insert(settings)
    .values(row)
    .onConflictDoUpdate({ target: settings.key, set: { value: row.value } });
}

/** The profile together with the latest logged body weight. */
export async function loadProfile() {
  const [profile, latestWeight] = await Promise.all([
    getProfile(),
    db.query.bodyWeights.findFirst({ orderBy: [desc(bodyWeights.measuredAt)] }),
  ]);
  return { profile, latestWeight };
}
