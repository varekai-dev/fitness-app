import { useMemo } from 'react';

import { loadAchievementData } from '@/db/achievements';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import { ACHIEVEMENT_GROUPS, computeAchievements } from '@/lib/achievements';
import { useEnabledModules } from '@/lib/modules';

/** Every achievement of the switched-on sections (body ones always), or undefined while loading. */
export function useAchievements() {
  const { data } = useFocusedDbQuery(loadAchievementData);
  const enabled = useEnabledModules();
  return useMemo(() => {
    if (!data) return undefined;
    const groups = ACHIEVEMENT_GROUPS.filter((g) => g === 'body' || enabled.includes(g));
    return computeAchievements(data, groups);
  }, [data, enabled]);
}
