import { GoalStepper, RecommendationCard } from '@/components/settings';
import { Loading, Screen } from '@/components/ui';
import { getKcalGoal, setKcalGoal } from '@/db/food';
import { loadProfile } from '@/db/profile';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatKcal, KCAL_GOAL_STEP, MAX_KCAL_GOAL, MIN_KCAL_GOAL } from '@/lib/food';
import { ACTIVITY, missingForRecommendation, recommendCalories, WEIGHT_GOAL } from '@/lib/profile';

/** The daily kcal goal with its profile-based recommendation. */
export default function FoodSettingsScreen() {
  const { data } = useDbQuery(() => Promise.all([getKcalGoal(), loadProfile()]));
  if (!data) return <Loading />;
  const [kcalGoal, { profile, latestWeight }] = data;
  const weightKg = latestWeight?.weightKg;
  const kcal = recommendCalories(profile, weightKg);
  const activity = `${ACTIVITY[profile.activity].label.toLowerCase()} активність`;

  return (
    <Screen title="Харчування">
      <GoalStepper
        title="Денна норма"
        unit="ккал"
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
        unit="ккал"
        format={formatKcal}
        details={kcal ? `${WEIGHT_GOAL[profile.goal].label} · ${activity} · ${kcal.age} р.` : ''}
        missing={missingForRecommendation(profile, weightKg).join(', ')}
        onAdopt={setKcalGoal}
      />
    </Screen>
  );
}
