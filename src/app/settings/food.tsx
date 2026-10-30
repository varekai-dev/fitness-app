import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { BottomSheet } from '@/components/bottom-sheet';
import { MACROS } from '@/components/calorie-summary';
import { Button, Card, Loading, Row, Screen, Text } from '@/components/ui';
import { Wheel } from '@/components/wheel';
import {
  getFoodShortcuts,
  getKcalGoal,
  getMacroGoals,
  setFoodShortcut,
  setKcalGoal,
  setMacroGoal,
} from '@/db/food';
import { loadProfile } from '@/db/profile';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import {
  formatKcal,
  KCAL_GOAL_STEP,
  macroTargets,
  MAX_KCAL_GOAL,
  MAX_MACRO_GOAL,
  MIN_KCAL_GOAL,
  type MacroGoals,
  type Macros,
} from '@/lib/food';
import { locale } from '@/lib/i18n';
import { formatWeightDelta } from '@/lib/labels';
import { formatNumber, formatWeight } from '@/lib/metrics';
import {
  ACTIVITY,
  bmi,
  BMI_CLASSES,
  bmiClass,
  calorieScale,
  calorieZone,
  healthyWeight,
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

const KCAL = t`ккал`;

/** Without a profile there is no maintenance to judge by, so the scale just spans common goals. */
const PLAIN_SCALE: CalorieScale = {
  min: MIN_KCAL_GOAL,
  max: 4000,
  segments: [{ from: MIN_KCAL_GOAL, to: 4000, zone: 'ok' }],
};

/**
 * The daily kcal goal on a scale around maintenance from the profile, and
 * whether the meals offer templates and "same as last time".
 */
export default function FoodSettingsScreen() {
  const { data } = useFocusedDbQuery(() =>
    Promise.all([getKcalGoal(), loadProfile(), getFoodShortcuts(), getMacroGoals()]),
  );
  // The value under the finger while the scale is dragged, saved on release. It
  // stays shown only until the saved goal moves away from the one it started at.
  const [draft, setDraft] = useState<{ value: number; from: number } | null>(null);
  if (!data) return <Loading />;
  const [savedGoal, { profile, latestWeight }, shortcuts, macroGoals] = data;
  const goal = draft?.from === savedGoal ? draft.value : savedGoal;
  const weightKg = latestWeight?.weightKg;
  const rec = recommendCalories(profile, weightKg);
  const scale =
    rec && weightKg && profile.sex ? calorieScale(rec.tdee, weightKg, profile.sex) : undefined;

  return (
    <Screen title={t`Харчування`}>
      <GoalCard
        goal={goal}
        tdee={rec?.tdee}
        recommended={rec?.kcal}
        scale={scale}
        profile={<ProfileRow profile={profile} weightKg={weightKg} age={rec?.age} />}
        onDrag={(value) => setDraft({ value, from: savedGoal })}
        onRelease={(value) => (value === savedGoal ? setDraft(null) : setKcalGoal(value))}
      />
      {weightKg && profile.heightCm ? (
        <BmiCard weightKg={weightKg} heightCm={profile.heightCm} />
      ) : null}
      <MacroGoalsCard
        goal={goal}
        targets={macroTargets(goal, weightKg ?? null, profile.goal, macroGoals)}
        custom={macroGoals}
      />
      <Card style={styles.shortcuts}>
        <ShortcutRow
          icon="bookmark-outline"
          title={t`Шаблони`}
          hint={t`Зберігати прийом їжі закладкою й додавати його в один тап.`}
          value={shortcuts.templates}
          onChange={(on) => setFoodShortcut('templates', on)}
        />
        <ShortcutRow
          icon="repeat"
          title={t`Підказки`}
          hint={t`Пропонувати повторити прийом їжі, як минулого разу.`}
          value={shortcuts.repeats}
          onChange={(on) => setFoodShortcut('repeats', on)}
        />
        <ShortcutRow
          icon="chatbubble-ellipses-outline"
          title={t`AI коментар дня`}
          hint={t`Оцінка з’їденого за день і що варто додати.`}
          value={shortcuts.dayReview}
          onChange={(on) => setFoodShortcut('dayReview', on)}
        />
        <ShortcutRow
          icon="sparkles-outline"
          title={t`Що поїсти`}
          hint={t`Порада AI для сніданку, обіду й вечері під залишок дня.`}
          value={shortcuts.mealAdvice}
          onChange={(on) => setFoodShortcut('mealAdvice', on)}
        />
      </Card>
    </Screen>
  );
}

const BMI_MIN = 15;
const BMI_MAX = 45;

/**
 * Body mass index from the latest weight and the height, on a bar of the WHO
 * classes, with the weights that would be normal at this height.
 */
function BmiCard({ weightKg, heightCm }: { weightKg: number; heightCm: number }) {
  const value = bmi(weightKg, heightCm);
  const cls = bmiClass(value);
  const color = ZONE_COLOR[cls.zone];
  const { minKg, maxKg } = healthyWeight(heightCm);
  const share = (v: number) =>
    (Math.min(Math.max(v, BMI_MIN), BMI_MAX) - BMI_MIN) / (BMI_MAX - BMI_MIN);
  const toNormal = weightKg > maxKg ? maxKg - weightKg : weightKg < minKg ? minKg - weightKg : 0;
  const [open, setOpen] = useState(false);

  return (
    <Card style={styles.bmiCard} onPress={() => setOpen(true)}>
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <BmiClasses weightKg={weightKg} heightCm={heightCm} />
      </BottomSheet>
      <Row style={styles.bmiHead}>
        <View style={styles.flex}>
          <Text variant="overline">{t`Індекс маси тіла`}</Text>
          <Text style={[styles.bmiValue, cls.zone !== 'ok' && { color }]}>
            {formatNumber(value, 1)}
          </Text>
        </View>
        <View style={styles.zonePill}>
          <View style={[styles.zoneDot, { backgroundColor: color }]} />
          <Text style={[styles.zoneText, { color }]}>{cls.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
      <View>
        <Row style={styles.bmiBar}>
          {BMI_CLASSES.map((c, i) => {
            const from = share(c.from);
            const to = share(BMI_CLASSES[i + 1]?.from ?? BMI_MAX);
            return to > from ? (
              <View
                key={c.from}
                style={[
                  styles.bmiSegment,
                  { flex: to - from, backgroundColor: ZONE_COLOR[c.zone] },
                ]}
              />
            ) : null;
          })}
        </Row>
        <View
          pointerEvents="none"
          style={[styles.bmiKnob, { left: `${share(value) * 100}%`, borderColor: color }]}
        />
      </View>
      <Text variant="muted">
        {t`Норма для ${formatNumber(cmToDisplay(heightCm), 0)} ${HEIGHT_UNIT}: `}
        {formatWeight(minKg, 0)}–{formatWeight(maxKg, 0)} {WEIGHT_UNIT}
        {toNormal !== 0 &&
          t` · до норми ${formatWeightDelta(toNormal)} ${WEIGHT_UNIT}`}
      </Text>
    </Card>
  );
}

/**
 * Each BMI class with the weights it spans at this height and how far the
 * current weight is from it.
 */
function BmiClasses({ weightKg, heightCm }: { weightKg: number; heightCm: number }) {
  const m2 = (heightCm / 100) ** 2;
  const current = bmiClass(bmi(weightKg, heightCm));
  const kg = (v: number) => `${formatWeight(v, 0)} ${WEIGHT_UNIT}`;
  return (
    <View style={styles.bmiSheet}>
      <View style={styles.bmiSheetHead}>
        <Text variant="title">{t`Індекс маси тіла`}</Text>
        <Text variant="muted">
          {formatNumber(cmToDisplay(heightCm), 0)} {HEIGHT_UNIT} · {t`зараз`}{' '}
          {formatWeight(weightKg, 1)} {WEIGHT_UNIT}
        </Text>
      </View>
      {BMI_CLASSES.map((c, i) => {
        const next = BMI_CLASSES[i + 1]?.from;
        const fromKg = c.from * m2;
        const toKg = next === undefined ? undefined : next * m2;
        const here = c === current;
        // Down to just under the class's top, or up to its start.
        const delta = here
          ? 0
          : toKg !== undefined && weightKg >= toKg
            ? toKg - 0.1 - weightKg
            : fromKg - weightKg;
        return (
          <Row key={c.from} style={[styles.bmiClass, here && styles.bmiClassHere]}>
            <View style={[styles.macroDot, { backgroundColor: ZONE_COLOR[c.zone] }]} />
            <View style={styles.flex}>
              <Text variant="body">{c.label}</Text>
              <Text variant="muted">
                {c.from === 0
                  ? t`ІМТ до ${next}`
                  : next === undefined
                    ? t`ІМТ від ${c.from}`
                    : `${t`ІМТ`} ${c.from}–${next}`}
                {' · '}
                {c.from === 0
                  ? t`до ${kg(toKg!)}`
                  : toKg === undefined
                    ? t`від ${kg(fromKg)}`
                    : `${formatWeight(fromKg, 0)}–${kg(toKg)}`}
              </Text>
            </View>
            <Text
              variant="heading"
              style={{ color: here ? ZONE_COLOR[c.zone] : colors.textSecondary }}>
              {here ? t`ти тут` : `${formatWeightDelta(delta)} ${WEIGHT_UNIT}`}
            </Text>
          </Row>
        );
      })}
    </View>
  );
}

const G = t`г`;
const formatGrams = (g: number) => String(g);

type MacroKey = (typeof MACROS)[number]['key'];

/**
 * Daily protein, fat and carbs. Each follows the kcal goal until set by hand;
 * auto carbs fill what protein and fat leave of it. A row opens a sheet with
 * a wheel to pick the grams.
 */
function MacroGoalsCard({
  goal,
  targets,
  custom,
}: {
  goal: number;
  targets: Macros;
  custom: MacroGoals;
}) {
  const [editing, setEditing] = useState<MacroKey | null>(null);
  // Kept while the sheet slides away, so it doesn't go blank mid-animation.
  const [shown, setShown] = useState(editing);
  if (editing !== null && editing !== shown) setShown(editing);
  const macro = MACROS.find((m) => m.key === shown);

  const total = MACROS.reduce((s, m) => s + targets[m.key] * m.kcalPerG, 0);
  // Rounding to whole grams alone moves the sum by a few kcal.
  const off = Math.abs(total - goal) > 25;
  return (
    <Card style={styles.macroCard}>
      <BottomSheet visible={editing !== null} onClose={() => setEditing(null)}>
        {macro && (
          <MacroSheet
            key={macro.key}
            label={macro.label}
            color={macro.color}
            kcalPerG={macro.kcalPerG}
            grams={targets[macro.key]}
            custom={custom[macro.key] !== undefined}
            onSave={(grams) => {
              setEditing(null);
              if (grams !== targets[macro.key] || grams === null) setMacroGoal(macro.key, grams);
            }}
          />
        )}
      </BottomSheet>
      <Text variant="overline">{t`БЖВ на день`}</Text>
      {MACROS.map((m) => (
        <MacroGoalRow
          key={m.key}
          label={m.label}
          color={m.color}
          kcalPerG={m.kcalPerG}
          grams={targets[m.key]}
          custom={custom[m.key] !== undefined}
          onPress={() => setEditing(m.key)}
        />
      ))}
      <Text variant="muted" style={[styles.macroTotal, off && { color: colors.warning }]}>
        {off
          ? t`Разом ${formatKcal(total)} ${KCAL}, а норма ${formatKcal(goal)} ${KCAL}`
          : autoHint(
              MACROS.filter((m) => custom[m.key] === undefined).map((m) => m.label),
              total,
            )}
      </Text>
    </Card>
  );
}

/** Which macros still follow the kcal goal, by name, or the kcal of all three set by hand. */
function autoHint(auto: string[], total: number) {
  if (auto.length === 0)
    return t`Разом ${formatKcal(total)} ${KCAL}`;
  if (auto.length === MACROS.length)
    return t`Усе рахується з норми калорій.`;
  const [first, ...rest] = auto;
  const names = [first, ...rest.map((n) => n.toLocaleLowerCase(locale))].join(t` і `);
  return t`${names} рахуються з норми калорій.`;
}

/** One macro's daily grams; tapped, it opens the wheel. */
function MacroGoalRow({
  label,
  color,
  kcalPerG,
  grams,
  custom,
  onPress,
}: {
  label: string;
  color: string;
  kcalPerG: number;
  grams: number;
  custom: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${grams} ${G}`}
      style={({ pressed }) => [styles.macroRow, pressed && styles.pressed]}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <View style={styles.flex}>
        <Text variant="body">{label}</Text>
        <Text variant="muted">
          {formatKcal(grams * kcalPerG)} {KCAL}
          {!custom && ` · ${t`авто`}`}
        </Text>
      </View>
      <View style={[styles.macroInput, custom && { borderColor: color }]}>
        <Text style={styles.macroValue}>{grams}</Text>
        <Text variant="muted">{G}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * The grams of one macro on a wheel, saved with the button. "Auto" hands the
 * macro back to the kcal goal.
 */
function MacroSheet({
  label,
  color,
  kcalPerG,
  grams,
  custom,
  onSave,
}: {
  label: string;
  color: string;
  kcalPerG: number;
  grams: number;
  custom: boolean;
  /** `null` goes back to auto. */
  onSave: (grams: number | null) => void;
}) {
  const [value, setValue] = useState(grams);
  return (
    <View style={styles.macroSheet}>
      <View style={styles.macroSheetHead}>
        <Row style={styles.macroSheetTitle}>
          <View style={[styles.macroDot, { backgroundColor: color }]} />
          <Text variant="title">{label}</Text>
        </Row>
        <Text variant="muted">
          {formatKcal(value * kcalPerG)} {KCAL}
          {!custom && value === grams && ` · ${t`авто`}`}
        </Text>
      </View>
      <View style={styles.macroWheel}>
        <Wheel
          value={grams}
          min={0}
          max={MAX_MACRO_GOAL}
          step={1}
          unit={G}
          format={formatGrams}
          rows={5}
          ticks
          onChange={setValue}
        />
      </View>
      <Row style={styles.macroSheetButtons}>
        {custom && (
          <Button
            title={t`Авто`}
            icon="refresh"
            variant="secondary"
            style={styles.flex}
            onPress={() => onSave(null)}
          />
        )}
        <Button
          title={t`Зберегти`}
          icon="checkmark"
          style={styles.flex}
          onPress={() => onSave(value)}
        />
      </Row>
    </View>
  );
}

/** A switch for one of the shortcuts shown on the meal cards. */
function ShortcutRow({
  icon,
  title,
  hint,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  // The whole row flips the switch, not just the switch itself.
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <View style={styles.flex}>
        <Text variant="heading">{title}</Text>
        <Text variant="muted">{hint}</Text>
      </View>
      {/* Only shows the state: a tap on it would also reach the row and flip it back. */}
      <View pointerEvents="none">
        <Switch
          value={value}
          trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
          thumbColor={colors.text}
        />
      </View>
    </Pressable>
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
    return diff < 0 ? t`Надто мало` : t`Забагато`;
  }
  if (zone === 'warning') return t`Швидкий набір`;
  if (stable) return t`Підтримка ваги`;
  return diff < 0 ? t`Схуднення` : t`Повільний набір`;
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
  profile,
  onDrag,
  onRelease,
}: {
  goal: number;
  tdee: number | undefined;
  recommended: number | undefined;
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
        <Text variant="overline">{t`Денна норма`}</Text>
        <Text variant="hero" style={{ color: textColor }}>
          {formatKcal(goal)}
          <Text style={styles.goalUnit}>
            {' '}
            {KCAL}/{t`день`}
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
          recommended={recommended}
          scale={scale ?? PLAIN_SCALE}
          color={color}
          onDrag={onDrag}
          onRelease={onRelease}
        />
        <Text variant="muted" style={styles.hint}>
          {t`Потягни повзунок, щоб змінити норму`}
        </Text>
      </View>

      {judged && (
        <>
          <Row style={styles.tiles}>
            <PaceTile
              value={stable ? '0' : formatWeightDelta(week)}
              unit={WEIGHT_UNIT}
              label={t`за тиждень`}
              color={textColor}
            />
            <PaceTile
              value={stable ? '0' : formatWeightDelta((week * 30) / 7)}
              unit={WEIGHT_UNIT}
              label={t`за місяць`}
              color={textColor}
            />
            <PaceTile
              value={diff === 0 ? '0' : `${diff > 0 ? '+' : '−'}${formatKcal(Math.abs(diff))}`}
              unit={KCAL}
              label={
                diff < 0 ? t`дефіцит/день` : t`профіцит/день`
              }
              color={textColor}
            />
          </Row>

          {zone !== 'ok' && (
            <Row style={styles.advice}>
              <Ionicons name="warning-outline" size={16} color={color} />
              <Text style={[styles.adviceText, { color }]}>
                {zone === 'warning'
                  ? t`Частина набору піде в жир.`
                  : diff < 0
                    ? t`Швидше за 1% ваги на тиждень: разом із жиром підуть мʼязи.`
                    : t`Набір піде переважно в жир.`}
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
const TRACK = KNOB + spacing.xs;

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
      onDrag(kcal);
    })
    .onEnd((e) => onRelease(valueAt(e.x)));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      onRelease(valueAt(e.x));
    });

  return (
    <View>
      {recommended !== undefined && (
        <Callout
          side="top"
          x={share(recommended) * width}
          width={width}
          label={t`Рекомендовано`}
          value={formatKcal(recommended)}
          color={colors.accent}
          onPress={() => {
            onRelease(recommended);
          }}
        />
      )}
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
          <View
            pointerEvents="none"
            style={[styles.knob, { left: at(goal), borderColor: color }]}
          />
        </View>
      </GestureDetector>
      {tdee !== undefined && (
        <Callout
          side="bottom"
          x={share(tdee) * width}
          width={width}
          label={t`Підтримка`}
          value={formatKcal(Math.round(tdee / 10) * 10)}
          color={colors.textSecondary}
        />
      )}
    </View>
  );
}

const CALLOUT_W = 170;

/**
 * A label pointing at a spot on the scale with a small arrow, above or below
 * it. The text slides in from the edges; the arrow stays on the spot.
 */
function Callout({
  side,
  x,
  width,
  label,
  value,
  color,
  onPress,
}: {
  side: 'top' | 'bottom';
  x: number;
  width: number;
  label: string;
  value: string;
  color: string;
  onPress?: () => void;
}) {
  const left = Math.min(Math.max(x - CALLOUT_W / 2, 0), Math.max(width - CALLOUT_W, 0));
  const arrow = (
    <Ionicons
      name={side === 'top' ? 'caret-down' : 'caret-up'}
      size={12}
      color={color}
      style={[
        styles.calloutArrow,
        side === 'top' ? styles.atBottom : styles.atTop,
        { left: x - 6 },
      ]}
    />
  );
  const text = (
    <Pressable
      disabled={!onPress}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.calloutText,
        side === 'top' ? styles.atTop : styles.atBottom,
        { left },
        pressed && styles.pressed,
      ]}>
      <Text variant="muted" style={[styles.calloutLabel, { color }]} numberOfLines={1}>
        {label} {value}
      </Text>
    </Pressable>
  );
  if (!width) return <View style={styles.callout} />;
  return (
    <View style={styles.callout}>
      {side === 'top' ? (
        <>
          {text}
          {arrow}
        </>
      ) : (
        <>
          {arrow}
          {text}
        </>
      )}
    </View>
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
          `${age} ${t`р.`}`,
          t`${ACTIVITY[profile.activity].label.toLowerCase()} активність`,
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
              {t`Ціль`}: {WEIGHT_GOAL[profile.goal].label.toLowerCase()}
            </Text>
            <Text variant="muted">{facts}</Text>
          </>
        ) : (
          <>
            <Text variant="body">{t`Заповни профіль`}</Text>
            <Text variant="muted">
              {t`Вкажи ${missing.join(', ')}, щоб бачити темп і безпечні межі.`}
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
  shortcuts: { gap: spacing.lg },
  macroCard: { gap: spacing.lg },
  bmiCard: { gap: spacing.md },
  bmiSheet: { gap: spacing.sm },
  bmiSheetHead: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  bmiClass: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bmiClassHere: { backgroundColor: colors.glass, borderColor: colors.glassBorder },
  bmiHead: { gap: spacing.md },
  bmiValue: { color: colors.text, fontSize: fontSize.hero, fontWeight: '800', letterSpacing: -1 },
  bmiBar: { height: BAR, gap: 3, marginVertical: (KNOB - BAR) / 4 },
  bmiSegment: { height: BAR, borderRadius: radius.pill },
  bmiKnob: {
    position: 'absolute',
    top: (BAR - KNOB / 1.5) / 2 + (KNOB - BAR) / 4,
    width: KNOB / 1.5,
    height: KNOB / 1.5,
    marginLeft: -KNOB / 3,
    borderRadius: KNOB / 3,
    borderWidth: 4,
    backgroundColor: colors.text,
  },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  macroDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.xs },
  macroInput: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    minWidth: 76,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
  },
  macroValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  macroSheet: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  macroSheetHead: { alignItems: 'center', gap: spacing.xs },
  macroSheetTitle: { gap: spacing.xs },
  macroWheel: { height: 200 },
  macroSheetButtons: { gap: spacing.sm },
  macroTotal: { textAlign: 'center' },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  hint: { textAlign: 'center', marginTop: spacing.md },
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
  callout: { height: 30 },
  atTop: { top: 0 },
  atBottom: { bottom: 0 },
  calloutText: { position: 'absolute', width: CALLOUT_W, alignItems: 'center' },
  calloutLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  calloutArrow: { position: 'absolute' },
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
