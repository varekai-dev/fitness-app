import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Card, Loading, Row, Screen, Text } from '@/components/ui';
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

/** The daily kcal goal on a scale around maintenance from the profile. */
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
        scale={scale}
        profile={<ProfileRow profile={profile} weightKg={weightKg} age={rec?.age} />}
        onDrag={(value) => setDraft({ value, from: savedGoal })}
        onRelease={(value) => (value === savedGoal ? setDraft(null) : setKcalGoal(value))}
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
  scale,
  profile,
  onDrag,
  onRelease,
}: {
  goal: number;
  tdee: number | undefined;
  scale: CalorieScale | undefined;
  /** What the scale is computed from, leading to the profile. */
  profile: ReactNode;
  onDrag: (kcal: number) => void;
  onRelease: (kcal: number) => void;
}) {
  const judged = scale && tdee !== undefined;
  const zone = judged ? calorieZone(scale, goal) : null;
  const color = zone ? ZONE_COLOR[zone] : colors.accent;
  // Text stays white while the goal is fine; only warnings take the zone colour.
  const textColor = zone && zone !== 'ok' ? color : colors.text;
  const diff = judged ? Math.round((goal - tdee) / 10) * 10 : 0;
  const week = judged ? weeklyWeightChange(tdee, goal) : 0;
  const stable = formatWeightDelta(week) === '0';

  return (
    <Card style={styles.goalCard}>
      <View style={styles.goalValue}>
        <Text variant="overline">{tr('Денна норма', 'Daily goal')}</Text>
        <Text variant="hero" style={{ color: textColor }}>
          {formatKcal(goal)}
          <Text style={styles.goalUnit}>
            {' '}
            {KCAL}/{tr('день', 'day')}
          </Text>
        </Text>
        {zone && (
          <View style={styles.zonePill}>
            <View style={[styles.zoneDot, { backgroundColor: color }]} />
            <Text style={[styles.zoneText, { color: textColor }]}>
              {zoneLabel(zone, diff, stable)}
            </Text>
          </View>
        )}
      </View>

      <View>
        <Scale
          goal={goal}
          tdee={tdee}
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
          </Row>

          <Row style={styles.tiles}>
            <PaceTile
              value={stable ? '0' : formatWeightDelta(week)}
              unit={WEIGHT_UNIT}
              label={tr('за тиждень', 'a week')}
              color={textColor}
            />
            <PaceTile
              value={stable ? '0' : formatWeightDelta((week * 30) / 7)}
              unit={WEIGHT_UNIT}
              label={tr('за місяць', 'a month')}
              color={textColor}
            />
            <PaceTile
              value={diff === 0 ? '0' : `${diff > 0 ? '+' : '−'}${formatKcal(Math.abs(diff))}`}
              unit={KCAL}
              label={
                diff < 0 ? tr('дефіцит/день', 'deficit/day') : tr('профіцит/день', 'surplus/day')
              }
              color={textColor}
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
      {profile}
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
  scale,
  color,
  onDrag,
  onRelease,
}: {
  goal: number;
  tdee: number | undefined;
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
 * The weight goal and the body numbers the scale is computed from, or what the
 * profile still lacks. Either way it opens the profile to change them.
 */
function ProfileRow({
  profile,
  weightKg,
  age,
}: {
  profile: Profile;
  weightKg: number | undefined;
  age: number | undefined;
}) {
  const missing = missingForRecommendation(profile, weightKg);
  const facts =
    missing.length === 0 && weightKg && profile.heightCm && age !== undefined
      ? [
          `${formatWeight(weightKg, 1)} ${WEIGHT_UNIT}`,
          `${formatNumber(cmToDisplay(profile.heightCm), 0)} ${HEIGHT_UNIT}`,
          `${age} ${tr('р.', 'y.o.')}`,
          tr(
            `${ACTIVITY[profile.activity].label.toLowerCase()} активність`,
            `${ACTIVITY[profile.activity].label.toLowerCase()} activity`,
          ),
        ].join(' · ')
      : null;

  return (
    <Pressable
      onPress={() => router.push('/profile')}
      style={({ pressed }) => [styles.profileRow, pressed && styles.pressed]}>
      <View style={styles.profileIcon}>
        <Ionicons name={facts ? 'flag' : 'person-outline'} size={18} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        {facts ? (
          <>
            <Text variant="body">
              {tr('Ціль', 'Goal')}: {WEIGHT_GOAL[profile.goal].label.toLowerCase()}
            </Text>
            <Text variant="muted">{facts}</Text>
          </>
        ) : (
          <>
            <Text variant="body">{tr('Заповни профіль', 'Fill in the profile')}</Text>
            <Text variant="muted">
              {tr(
                `Вкажи ${missing.join(', ')}, щоб бачити темп і безпечні межі.`,
                `Enter your ${missing.join(', ')} to see the pace and safe limits.`,
              )}
            </Text>
          </>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
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
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
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
  legend: { justifyContent: 'center' },
  legendItem: { gap: 6 },
  legendTick: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    backgroundColor: colors.text,
    opacity: 0.7,
  },
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
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  profileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  pressed: { opacity: 0.7 },
});
