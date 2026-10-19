import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { MACROS } from '@/components/calorie-summary';
import { Card, IconButton, Loading, Row, Screen, Text } from '@/components/ui';
import {
  getFoodShortcuts,
  getKcalGoal,
  getMacroGoals,
  setFoodShortcut,
  setKcalGoal,
  setMacroGoal,
} from '@/db/food';
import { loadProfile } from '@/db/profile';
import { useDbQuery } from '@/hooks/use-db-query';
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

/**
 * The daily kcal goal on a scale around maintenance from the profile, and
 * whether the meals offer templates and "same as last time".
 */
export default function FoodSettingsScreen() {
  const { data } = useDbQuery(() =>
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
    <Screen title={tr('Харчування', 'Food')}>
      <GoalCard
        goal={goal}
        tdee={rec?.tdee}
        recommended={rec?.kcal}
        scale={scale}
        profile={<ProfileRow profile={profile} weightKg={weightKg} age={rec?.age} />}
        onDrag={(value) => setDraft({ value, from: savedGoal })}
        onRelease={(value) => (value === savedGoal ? setDraft(null) : setKcalGoal(value))}
      />
      <MacroGoalsCard
        goal={goal}
        targets={macroTargets(goal, weightKg ?? null, profile.goal, macroGoals)}
        custom={macroGoals}
      />
      <Card style={styles.shortcuts}>
        <ShortcutRow
          icon="bookmark-outline"
          title={tr('Шаблони', 'Templates')}
          hint={tr(
            'Зберігати прийом їжі закладкою й додавати його в один тап.',
            'Save a meal with the bookmark and add it again in one tap.',
          )}
          value={shortcuts.templates}
          onChange={(on) => setFoodShortcut('templates', on)}
        />
        <ShortcutRow
          icon="repeat"
          title={tr('Підказки', 'Suggestions')}
          hint={tr(
            'Пропонувати повторити прийом їжі, як минулого разу.',
            'Offer to repeat a meal the way it was last time.',
          )}
          value={shortcuts.repeats}
          onChange={(on) => setFoodShortcut('repeats', on)}
        />
        <ShortcutRow
          icon="chatbubble-ellipses-outline"
          title={tr('AI коментар дня', 'AI day comment')}
          hint={tr(
            'Оцінка з’їденого за день і що варто додати.',
            'A take on the day’s food and what is worth adding.',
          )}
          value={shortcuts.dayReview}
          onChange={(on) => setFoodShortcut('dayReview', on)}
        />
        <ShortcutRow
          icon="sparkles-outline"
          title={tr('Що поїсти', 'What to eat')}
          hint={tr(
            'Порада AI для сніданку, обіду й вечері під залишок дня.',
            'AI advice for breakfast, lunch and dinner to fit what’s left of the day.',
          )}
          value={shortcuts.mealAdvice}
          onChange={(on) => setFoodShortcut('mealAdvice', on)}
        />
      </Card>
    </Screen>
  );
}

const MACRO_STEP = 5;
const G = tr('г', 'g');

const clampMacro = (grams: number) => Math.min(Math.max(Math.round(grams), 0), MAX_MACRO_GOAL);

/**
 * Daily protein, fat and carbs. Each follows the kcal goal until set by hand;
 * auto carbs fill what protein and fat leave of it.
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
  const total = MACROS.reduce((s, m) => s + targets[m.key] * m.kcalPerG, 0);
  // Rounding to whole grams alone moves the sum by a few kcal.
  const off = Math.abs(total - goal) > 25;
  return (
    <Card style={styles.macroCard}>
      <Text variant="overline">{tr('БЖВ на день', 'Daily macros')}</Text>
      {MACROS.map((m) => (
        <MacroGoalRow
          key={m.key}
          label={m.label}
          color={m.color}
          kcalPerG={m.kcalPerG}
          grams={targets[m.key]}
          custom={custom[m.key] !== undefined}
          onChange={(grams) => setMacroGoal(m.key, grams)}
        />
      ))}
      <Text variant="muted" style={[styles.macroTotal, off && { color: colors.warning }]}>
        {off
          ? tr(
              `Разом ${formatKcal(total)} ${KCAL}, а норма ${formatKcal(goal)} ${KCAL}`,
              `${formatKcal(total)} ${KCAL} in all, the goal is ${formatKcal(goal)} ${KCAL}`,
            )
          : tr(
              'Не змінене рахується з норми калорій.',
              'What you leave alone follows the kcal goal.',
            )}
      </Text>
    </Card>
  );
}

/** One macro's daily grams: typed in or stepped by 5 g; cleared, it goes back to auto. */
function MacroGoalRow({
  label,
  color,
  kcalPerG,
  grams,
  custom,
  onChange,
}: {
  label: string;
  color: string;
  kcalPerG: number;
  grams: number;
  custom: boolean;
  onChange: (grams: number | null) => void;
}) {
  // The text being typed; the saved value shows otherwise.
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    setText(null);
    const value = Number(text.replace(',', '.'));
    if (!text.trim()) onChange(null);
    else if (Number.isFinite(value) && clampMacro(value) !== grams) onChange(clampMacro(value));
  };
  const step = (dir: 1 | -1) =>
    onChange(
      clampMacro(
        (dir > 0 ? Math.floor(grams / MACRO_STEP) + 1 : Math.ceil(grams / MACRO_STEP) - 1) *
          MACRO_STEP,
      ),
    );

  return (
    <Row style={styles.macroRow}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <View style={styles.flex}>
        <Text variant="body">{label}</Text>
        <Row style={styles.macroMeta}>
          <Text variant="muted">
            {formatKcal(grams * kcalPerG)} {KCAL} ·{' '}
          </Text>
          {custom ? (
            <Pressable hitSlop={8} onPress={() => onChange(null)}>
              {({ pressed }) => (
                <Text variant="muted" style={[styles.macroReset, pressed && styles.pressed]}>
                  {tr('повернути авто', 'back to auto')}
                </Text>
              )}
            </Pressable>
          ) : (
            <Text variant="muted">{tr('авто', 'auto')}</Text>
          )}
        </Row>
      </View>
      <IconButton icon="remove" size={20} disabled={grams <= 0} onPress={() => step(-1)} />
      <View style={[styles.macroInput, custom && { borderColor: color }]}>
        <TextInput
          value={text ?? String(grams)}
          onChangeText={setText}
          onFocus={() => setText(String(grams))}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          maxLength={3}
          style={styles.macroValue}
        />
        <Text variant="muted">{G}</Text>
      </View>
      <IconButton
        icon="add"
        size={20}
        disabled={grams >= MAX_MACRO_GOAL}
        onPress={() => step(1)}
      />
    </Row>
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
  const toggle = (on: boolean) => {
    onChange(on);
  };
  // The whole row flips the switch, not just the switch itself.
  return (
    <Pressable
      onPress={() => toggle(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <View style={styles.flex}>
        <Text variant="heading">{title}</Text>
        <Text variant="muted">{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={toggle}
        trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
        thumbColor={colors.text}
      />
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
          label={tr('Рекомендовано', 'Recommended')}
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
          label={tr('Підтримка', 'Maintenance')}
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
  shortcuts: { gap: spacing.lg },
  macroCard: { gap: spacing.lg },
  macroRow: { gap: spacing.sm },
  macroDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.xs },
  macroMeta: { flexWrap: 'wrap' },
  macroReset: { color: colors.accent },
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
    textAlign: 'right',
    padding: 0,
  },
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
