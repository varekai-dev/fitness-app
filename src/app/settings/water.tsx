import { t } from '@lingui/core/macro';
import { GoalStepper, RecommendationCard } from '@/components/settings';
import { Loading, Screen } from '@/components/ui';
import { loadProfile } from '@/db/profile';
import { getWaterGoal, setWaterGoal } from '@/db/water';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import { formatWeight } from '@/lib/metrics';
import { ACTIVITY, recommendWater } from '@/lib/profile';
import { displayToMl, formatVolume, mlToDisplay, VOLUME_UNIT, WEIGHT_UNIT } from '@/lib/units';
import { MAX_WATER_GOAL, MIN_WATER_GOAL, WATER_GOAL_STEP } from '@/lib/water';

/** The daily water goal with its weight-based recommendation. */
export default function WaterSettingsScreen() {
  const { data } = useFocusedDbQuery(() => Promise.all([getWaterGoal(), loadProfile()]));
  if (!data) return <Loading />;
  const [waterGoal, { profile, latestWeight }] = data;
  const weightKg = latestWeight?.weightKg;
  const water = recommendWater(profile, weightKg);
  const activity = t`${ACTIVITY[profile.activity].label.toLowerCase()} активність`;

  return (
    <Screen title={t`Вода`}>
      <GoalStepper
        title={t`Денна ціль`}
        unit={VOLUME_UNIT}
        // The stepper works in the chosen unit; the goal is saved in ml.
        value={Math.round(mlToDisplay(waterGoal))}
        step={WATER_GOAL_STEP}
        min={MIN_WATER_GOAL}
        max={MAX_WATER_GOAL}
        format={(v) => formatVolume(displayToMl(v))}
        onChange={(v) => setWaterGoal(displayToMl(v))}
      />
      <RecommendationCard
        value={water}
        goal={waterGoal}
        unit={VOLUME_UNIT}
        format={formatVolume}
        details={weightKg ? `${formatWeight(weightKg, 0)} ${WEIGHT_UNIT} · ${activity}` : ''}
        missing={t`вагу`}
        onAdopt={setWaterGoal}
      />
    </Screen>
  );
}
