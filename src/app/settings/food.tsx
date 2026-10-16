import { GoalStepper, RecommendationCard } from '@/components/settings';
import { Loading, Screen } from '@/components/ui';
import { getKcalGoal, setKcalGoal } from '@/db/food';
import { loadProfile } from '@/db/profile';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatKcal, KCAL_GOAL_STEP, MAX_KCAL_GOAL, MIN_KCAL_GOAL } from '@/lib/food';
import { tr } from '@/lib/i18n';
import { ACTIVITY, missingForRecommendation, recommendCalories, WEIGHT_GOAL } from '@/lib/profile';

/** The daily kcal goal with its profile-based recommendation. */
export default function FoodSettingsScreen() {
  const { data } = useDbQuery(() => Promise.all([getKcalGoal(), loadProfile()]));
  if (!data) return <Loading />;
  const [kcalGoal, { profile, latestWeight }] = data;
  const weightKg = latestWeight?.weightKg;
  const kcal = recommendCalories(profile, weightKg);
  const activity = tr(
    `${ACTIVITY[profile.activity].label.toLowerCase()} активність`,
    `${ACTIVITY[profile.activity].label.toLowerCase()} activity`,
  );

  return (
    <Screen title={tr('Харчування', 'Food')}>
      <GoalStepper
        title={tr('Денна норма', 'Daily goal')}
        unit={tr('ккал', 'kcal')}
        value={kcalGoal}
        step={KCAL_GOAL_STEP}
        min={MIN_KCAL_GOAL}
        max={MAX_KCAL_GOAL}
        format={formatKcal}
        onChange={setKcalGoal}
      />
      <RecommendationCard
        value={kcal?.kcal ?? null}
        goal={kcalGoal}
        unit={tr('ккал', 'kcal')}
        format={formatKcal}
        details={
          kcal
            ? `${WEIGHT_GOAL[profile.goal].label} · ${activity} · ${kcal.age} ${tr('р.', 'y.o.')}`
            : ''
        }
        missing={missingForRecommendation(profile, weightKg).join(', ')}
        onAdopt={setKcalGoal}
      />
    </Screen>
  );
}
