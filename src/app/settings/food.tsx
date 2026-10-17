import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Button, Card, Loading, Row, Screen, Text } from '@/components/ui';
import { getKcalGoal, setKcalGoal } from '@/db/food';
import { loadProfile } from '@/db/profile';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatKcal, KCAL_GOAL_STEP, MAX_KCAL_GOAL, MIN_KCAL_GOAL } from '@/lib/food';
import { tr } from '@/lib/i18n';
import { formatWeightDelta } from '@/lib/labels';
import { formatNumber, formatWeight } from '@/lib/metrics';
import {
  ACTIVITY,
  calorieScale,
  calorieZone,
  missingForRecommendation,
  recommendCalories,
  WEIGHT_GOAL,
  weeklyWeightChange,
  type CalorieRecommendation,
  type CalorieScale,
  type CalorieZone,
  type Profile,
} from '@/lib/profile';
import { cmToDisplay, HEIGHT_UNIT, WEIGHT_UNIT } from '@/lib/units';
import { colors, fontSize, radius, spacing } from '@/theme';

const KCAL = tr('ккал', 'kcal');

/** Without a profile there is no maintenance to judge by, so the scale just spans common goals. */
const PLAIN_SCALE: CalorieScale = {
  min: MIN_KCAL_GOAL,
  max: 4000,
  segments: [{ from: MIN_KCAL_GOAL, to: 4000, zone: 'ok' }],
};

/** The daily kcal goal on a scale around maintenance, with the profile-based recommendation. */
export default function FoodSettingsScreen() {
  const { data } = useDbQuery(() => Promise.all([getKcalGoal(), loadProfile()]));
  // The value under the finger while the scale is dragged, saved on release. It
  // stays shown only until the saved goal moves away from the one it started at.
  const [draft, setDraft] = useState<{ value: number; from: number } | null>(null);
  if (!data) return <Loading />;
  const [savedGoal, { profile, latestWeight }] = data;
  const goal = draft?.from === savedGoal ? draft.value : savedGoal;
  const weightKg = latestWeight?.weightKg;
  const rec = recommendCalories(profile, weightKg);
  const scale =
    rec && weightKg && profile.sex ? calorieScale(rec.tdee, weightKg, profile.sex) : undefined;

  return (
    <Screen title={tr('Харчування', 'Food')}>
      <GoalCard
        goal={goal}
        tdee={rec?.tdee}
        recommended={rec?.kcal}
        scale={scale}
        onDrag={(value) => setDraft({ value, from: savedGoal })}
        onRelease={(value) => (value === savedGoal ? setDraft(null) : setKcalGoal(value))}
      />
      <RecommendationCard
        rec={rec}
        goal={goal}
        profile={profile}
        weightKg={weightKg}
        onAdopt={(kcal) => {
          Haptics.selectionAsync();
          setKcalGoal(kcal);
        }}
      />
    </Screen>
  );
}

const ZONE_COLOR: Record<CalorieZone, string> = {
  danger: colors.danger,
  ok: colors.success,
  warning: colors.warning,
};

/** A kcal goal on the step grid, within both the scale and the allowed goals. */
const snapGoal = (kcal: number, scale: CalorieScale) =>
  Math.min(
    Math.max(Math.round(kcal / KCAL_GOAL_STEP) * KCAL_GOAL_STEP, MIN_KCAL_GOAL, scale.min),
    MAX_KCAL_GOAL,
    scale.max,
  );

/** What the goal does to the weight, in a word or two. */
function zoneLabel(zone: CalorieZone, diff: number, stable: boolean) {
  if (zone === 'danger') {
    return diff < 0 ? tr('Надто мало', 'Too little') : tr('Забагато', 'Too much');
  }
  if (zone === 'warning') return tr('Швидкий набір', 'Fast gain');
  if (stable) return tr('Підтримка ваги', 'Maintenance');
  return diff < 0 ? tr('Схуднення', 'Weight loss') : tr('Повільний набір', 'Lean gain');
}

/**
 * The goal on a draggable scale and, once the profile allows, where it sits
 * between too little and too much against maintenance (the profile's TDEE:
 * weight, height, age, sex and activity) and how fast it moves the weight.
 */
function GoalCard({
  goal,
  tdee,
  recommended,
  scale,
  onDrag,
  onRelease,
}: {
  goal: number;
  tdee: number | undefined;
  recommended: number | undefined;
  scale: CalorieScale | undefined;
  onDrag: (kcal: number) => void;
  onRelease: (kcal: number) => void;
}) {
  const judged = scale && tdee !== undefined;
  const zone = judged ? calorieZone(scale, goal) : null;
  const color = zone ? ZONE_COLOR[zone] : colors.accent;
  const diff = judged ? Math.round((goal - tdee) / 10) * 10 : 0;
  const week = judged ? weeklyWeightChange(tdee, goal) : 0;
  const stable = formatWeightDelta(week) === '0';

  return (
    <Card style={styles.goalCard}>
      <View style={styles.goalValue}>
        <Text variant="overline">{tr('Денна норма', 'Daily goal')}</Text>
        <Text variant="hero" style={{ color: zone ? color : colors.text }}>
          {formatKcal(goal)}
          <Text style={styles.goalUnit}>
            {' '}
            {KCAL}/{tr('день', 'day')}
          </Text>
        </Text>
        {zone && (
          <View style={[styles.zonePill, { backgroundColor: `${color}22` }]}>
            <View style={[styles.zoneDot, { backgroundColor: color }]} />
            <Text style={[styles.zoneText, { color }]}>{zoneLabel(zone, diff, stable)}</Text>
          </View>
        )}
      </View>

      <View>
        <Scale
          goal={goal}
          tdee={tdee}
          recommended={recommended}
          scale={scale ?? PLAIN_SCALE}
          color={color}
          onDrag={onDrag}
          onRelease={onRelease}
        />
        <Text variant="muted" style={styles.hint}>
          {tr('Потягни повзунок, щоб змінити норму', 'Drag the slider to change the goal')}
        </Text>
      </View>

      {judged && (
        <>
          <Row style={styles.legend}>
            <Row style={styles.legendItem}>
              <View style={styles.legendTick} />
              <Text variant="muted">
                {tr('Підтримка', 'Maintenance')} {formatKcal(Math.round(tdee / 10) * 10)}
              </Text>
            </Row>
            {recommended !== undefined && (
              <Row style={styles.legendItem}>
                <View style={styles.legendDot} />
                <Text variant="muted">
                  {tr('Рекомендовано', 'Recommended')} {formatKcal(recommended)}
                </Text>
              </Row>
            )}
          </Row>

          <Row style={styles.tiles}>
            <PaceTile
              value={stable ? '0' : formatWeightDelta(week)}
              unit={WEIGHT_UNIT}
              label={tr('за тиждень', 'a week')}
              color={color}
            />
            <PaceTile
              value={stable ? '0' : formatWeightDelta((week * 30) / 7)}
              unit={WEIGHT_UNIT}
              label={tr('за місяць', 'a month')}
              color={color}
            />
            <PaceTile
              value={diff === 0 ? '0' : `${diff > 0 ? '+' : '−'}${formatKcal(Math.abs(diff))}`}
              unit={KCAL}
              label={
                diff < 0 ? tr('дефіцит/день', 'deficit/day') : tr('профіцит/день', 'surplus/day')
              }
              color={color}
            />
          </Row>

          {zone !== 'ok' && (
            <Row style={styles.advice}>
              <Ionicons name="warning-outline" size={16} color={color} />
              <Text style={[styles.adviceText, { color }]}>
                {zone === 'warning'
                  ? tr('Частина набору піде в жир.', 'Part of the gain goes to fat.')
                  : diff < 0
                    ? tr(
                        'Швидше за 1% ваги на тиждень: разом із жиром підуть мʼязи.',
                        'Faster than 1% of weight a week: muscle goes along with fat.',
                      )
                    : tr('Набір піде переважно в жир.', 'The gain goes mostly to fat.')}
              </Text>
            </Row>
          )}
        </>
      )}
    </Card>
  );
}

const KNOB = 28;
const BAR = 10;
const TRACK = KNOB + spacing.lg;

/**
 * The zones blended into one gradient, with the goal as a knob that follows a
 * drag or jumps to a tap. Vertical drags still scroll the screen.
 */
function Scale({
  goal,
  tdee,
  recommended,
  scale,
  color,
  onDrag,
  onRelease,
}: {
  goal: number;
  tdee: number | undefined;
  recommended: number | undefined;
  scale: CalorieScale;
  color: string;
  onDrag: (kcal: number) => void;
  onRelease: (kcal: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const span = scale.max - scale.min;
  const share = (kcal: number) => Math.min(Math.max((kcal - scale.min) / span, 0), 1);
  const at = (kcal: number): `${number}%` => `${share(kcal) * 100}%`;
  const valueAt = (x: number) => snapGoal(scale.min + (x / (width || 1)) * span, scale);

  // A stop in the middle of each zone, so neighbouring zones flow into each other.
  const zones = scale.segments.filter((s) => s.to > s.from);
  const stops =
    tdee === undefined
      ? [
          { at: 0, color: colors.accentGradientEnd },
          { at: 1, color: colors.accent },
        ]
      : [
          { at: 0, color: ZONE_COLOR[zones[0].zone] },
          ...zones.flatMap((s, i) => [
            // Red straight into green mixes to brown, so pass through amber.
            ...(i > 0 && s.zone !== 'warning' && zones[i - 1].zone !== 'warning'
              ? [{ at: share(s.from), color: colors.warning }]
              : []),
            { at: share((s.from + s.to) / 2), color: ZONE_COLOR[s.zone] },
          ]),
          { at: 1, color: ZONE_COLOR[zones[zones.length - 1].zone] },
        ];

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const kcal = valueAt(e.x);
      if (kcal === goal) return;
      Haptics.selectionAsync();
      onDrag(kcal);
    })
    .onEnd((e) => onRelease(valueAt(e.x)));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      Haptics.selectionAsync();
      onRelease(valueAt(e.x));
    });

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <LinearGradient
          pointerEvents="none"
          colors={stops.map((s) => s.color) as [string, string, ...string[]]}
          locations={stops.map((s) => s.at) as [number, number, ...number[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bar}
        />
        {tdee !== undefined && (
          <View pointerEvents="none" style={[styles.tick, { left: at(tdee) }]} />
        )}
        {recommended !== undefined && (
          <View pointerEvents="none" style={[styles.recDot, { left: at(recommended) }]} />
        )}
        <View pointerEvents="none" style={[styles.knob, { left: at(goal), borderColor: color }]} />
      </View>
    </GestureDetector>
  );
}

function PaceTile({
  value,
  unit,
  label,
  color,
}: {
  value: string;
  unit: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]} numberOfLines={1}>
        {value}
        <Text style={styles.tileUnit}> {unit}</Text>
      </Text>
      <Text variant="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The profile-based goal, with what it is computed from and a button to adopt
 * it. Without a full profile it says what is missing and leads there.
 */
function RecommendationCard({
  rec,
  goal,
  profile,
  weightKg,
  onAdopt,
}: {
  rec: CalorieRecommendation | null;
  goal: number;
  profile: Profile;
  weightKg: number | undefined;
  onAdopt: (kcal: number) => void;
}) {
  const header = (
    <Row style={styles.recHeader}>
      <View style={styles.recIcon}>
        <Ionicons name="sparkles" size={20} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Text variant="overline">{tr('Рекомендовано', 'Recommended')}</Text>
        {rec && (
          <Text variant="title">
            {formatKcal(rec.kcal)}
            <Text style={styles.recUnit}>
              {' '}
              {KCAL}/{tr('день', 'day')}
            </Text>
          </Text>
        )}
      </View>
      <Pressable hitSlop={8} onPress={() => router.push('/profile')} style={styles.recEdit}>
        <Text variant="caption">{tr('Профіль', 'Profile')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </Pressable>
    </Row>
  );

  if (!rec || !weightKg || !profile.heightCm) {
    const missing = missingForRecommendation(profile, weightKg).join(', ');
    return (
      <Card>
        {header}
        <Text variant="secondary">
          {tr(
            `Вкажи в профілі ${missing}, і тут зʼявиться норма під тебе та шкала з безпечним темпом.`,
            `Enter your ${missing} in the profile to get a goal made for you and a scale of safe pace.`,
          )}
        </Text>
        <Button
          title={tr('Заповнити профіль', 'Fill in the profile')}
          onPress={() => router.push('/profile')}
        />
      </Card>
    );
  }

  const inputs = [
    `${formatWeight(weightKg, 1)} ${WEIGHT_UNIT}`,
    `${formatNumber(cmToDisplay(profile.heightCm), 0)} ${HEIGHT_UNIT}`,
    `${rec.age} ${tr('р.', 'y.o.')}`,
    tr(
      `${ACTIVITY[profile.activity].label.toLowerCase()} активність`,
      `${ACTIVITY[profile.activity].label.toLowerCase()} activity`,
    ),
  ];

  return (
    <Card>
      {header}
      <View style={styles.recFacts}>
        <Row style={styles.recFact}>
          <Ionicons name="flag-outline" size={16} color={colors.textSecondary} />
          <Text variant="caption">
            {tr('Ціль', 'Goal')}: {WEIGHT_GOAL[profile.goal].label.toLowerCase()}
          </Text>
        </Row>
        <Row style={styles.recFact}>
          <Ionicons name="body-outline" size={16} color={colors.textSecondary} />
          <Text variant="caption" style={styles.flex}>
            {inputs.join(' · ')}
          </Text>
        </Row>
      </View>
      {rec.kcal === goal ? (
        <Row style={styles.recDone}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text variant="caption" style={{ color: colors.success }}>
            {tr('Це твоя поточна норма', 'This is your current goal')}
          </Text>
        </Row>
      ) : (
        <Button
          title={tr(
            `Застосувати ${formatKcal(rec.kcal)} ${KCAL}`,
            `Apply ${formatKcal(rec.kcal)} ${KCAL}`,
          )}
          icon="checkmark"
          onPress={() => onAdopt(rec.kcal)}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  goalCard: { gap: spacing.lg },
  goalValue: { alignItems: 'center', gap: spacing.xs },
  goalUnit: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600' },
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneText: { fontSize: fontSize.sm, fontWeight: '700' },
  // Taller than the bar so the finger finds it.
  track: { height: TRACK, justifyContent: 'center' },
  bar: { height: BAR, borderRadius: radius.pill },
  hint: { textAlign: 'center' },
  tick: {
    position: 'absolute',
    width: 3,
    height: BAR + 10,
    marginLeft: -1.5,
    borderRadius: 1.5,
    backgroundColor: colors.text,
    opacity: 0.7,
  },
  recDot: {
    position: 'absolute',
    top: TRACK / 2 - BAR / 2 - 12,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    marginLeft: -KNOB / 2,
    borderRadius: KNOB / 2,
    borderWidth: 5,
    backgroundColor: colors.text,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  legend: { justifyContent: 'space-between', flexWrap: 'wrap' },
  legendItem: { gap: 6 },
  legendTick: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    backgroundColor: colors.text,
    opacity: 0.7,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  tiles: { gap: spacing.sm },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  tileValue: { fontSize: fontSize.lg, fontWeight: '800' },
  tileUnit: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' },
  advice: { gap: spacing.sm, alignItems: 'flex-start' },
  adviceText: { flex: 1, fontSize: fontSize.sm },
  recHeader: { gap: spacing.md },
  recIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  recUnit: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600' },
  recEdit: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  recFacts: { gap: spacing.sm },
  recFact: { gap: spacing.sm },
  recDone: { gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.xs },
});
