import { GoalStepper, RecommendationCard } from '@/components/settings';
import { Loading, Screen } from '@/components/ui';
import { loadProfile } from '@/db/profile';
import { getWaterGoal, setWaterGoal } from '@/db/water';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatGrams } from '@/lib/food';
import { ACTIVITY, recommendWater } from '@/lib/profile';
import { formatMl, MAX_WATER_GOAL_ML, MIN_WATER_GOAL_ML, WATER_GOAL_STEP_ML } from '@/lib/water';

/** The daily water goal with its weight-based recommendation. */
export default function WaterSettingsScreen() {
  const { data } = useDbQuery(() => Promise.all([getWaterGoal(), loadProfile()]));
  if (!data) return <Loading />;
  const [waterGoal, { profile, latestWeight }] = data;
  const weightKg = latestWeight?.weightKg;
  const water = recommendWater(profile, weightKg);
  const activity = `${ACTIVITY[profile.activity].label.toLowerCase()} активність`;

  return (
    <Screen title="Вода">
      <GoalStepper
        title="Денна ціль"
        unit="мл"
        value={waterGoal}
        step={WATER_GOAL_STEP_ML}
        min={MIN_WATER_GOAL_ML}
        max={MAX_WATER_GOAL_ML}
        format={formatMl}
        onChange={setWaterGoal}
      />
      <RecommendationCard
        value={water}
        goal={waterGoal}
        unit="мл"
        format={formatMl}
        details={weightKg ? `${formatGrams(weightKg)} кг · ${activity}` : ''}
        missing="вагу"
        onAdopt={setWaterGoal}
      />
    </Screen>
  );
}
