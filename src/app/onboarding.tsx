import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityPicker } from '@/components/activity-picker';
import {
  Button,
  Card,
  ChipGroup,
  Loading,
  Row,
  Screen,
  Text,
  type IconName,
} from '@/components/ui';
import { WeightRuler } from '@/components/weight-ruler';
import { Wheel } from '@/components/wheel';
import { saveBodyWeight } from '@/db/body-weight';
import { loadProfile, setProfileField } from '@/db/profile';
import { locale } from '@/lib/i18n';
import {
  ageOn,
  GOAL_LABELS,
  MAX_AGE,
  MIN_AGE,
  SEX_LABELS,
  SEXES,
  WEIGHT_GOALS,
  type ActivityLevel,
  type Sex,
  type WeightGoal,
} from '@/lib/profile';
import {
  cmToDisplay,
  displayToCm,
  displayToKg,
  HEIGHT_UNIT,
  kgToDisplay,
  WEIGHT_UNIT,
} from '@/lib/units';
import { colors, fontSize, spacing } from '@/theme';

type Step = 'sex' | 'birthDate' | 'height' | 'weight' | 'activity';

const STEPS: Record<Step, { icon: IconName; title: () => string; why: () => string }> = {
  sex: {
    icon: 'person-outline',
    title: () => t`Стать`,
    why: () =>
      t`У чоловіків і жінок різний базовий обмін, тож від статі залежить норма калорій.`,
  },
  birthDate: {
    icon: 'calendar-outline',
    title: () => t`Дата народження`,
    why: () =>
      t`З віком базовий обмін сповільнюється, тож вік потрібен для норми калорій.`,
  },
  height: {
    icon: 'resize-outline',
    title: () => t`Зріст`,
    why: () =>
      t`Зріст потрібен для норми калорій та індексу маси тіла.`,
  },
  weight: {
    icon: 'scale-outline',
    title: () => t`Вага`,
    why: () =>
      t`Від ваги залежать норми калорій і води та індекс маси тіла. Вона стане першим записом у журналі ваги.`,
  },
  activity: {
    icon: 'flame-outline',
    title: () => t`Активність і мета`,
    why: () =>
      t`Активність показує, скільки ти витрачаєш за день, а мета — чи їсти менше, чи більше за це.`,
  },
};

const HEIGHT_RANGE = [100, 250].map((cm) => Math.round(cmToDisplay(cm)));
const formatHeight = (v: number) => String(v);

const THIS_YEAR = new Date().getFullYear();
const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' });
const formatMonth = (m: number) => monthFormatter.format(new Date(2000, m - 1, 1)).replace('.', '');
const formatPlain = (n: number) => String(n);
const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate();
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Asks for what the calorie, water and BMI calculations need, one value per
 * step. Only the missing ones are asked, activity and goal every time. All of it
 * is saved on Done, which completes the profile, and the root layout then opens the app.
 */
export default function OnboardingScreen() {
  // Fixed once on open, so going back and forth doesn't reshuffle them.
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [sex, setSex] = useState<Sex | null>(null);
  const [birth, setBirth] = useState({ day: 1, month: 1, year: THIS_YEAR - 30 });
  const [height, setHeight] = useState(() => Math.round(cmToDisplay(170)));
  const [weight, setWeight] = useState(() => Math.round(kgToDisplay(70)));
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<WeightGoal>('maintain');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile().then(({ profile, latestWeight }) => {
      setActivity(profile.activity);
      setGoal(profile.goal);
      setSteps([
        ...(profile.sex ? [] : (['sex'] as const)),
        ...(profile.birthDate ? [] : (['birthDate'] as const)),
        ...(profile.heightCm ? [] : (['height'] as const)),
        ...(latestWeight ? [] : (['weight'] as const)),
        'activity',
      ]);
    });
  }, []);

  if (!steps) return <Loading />;
  const step = steps[index];
  const last = index === steps.length - 1;

  // The day wheel offers 31 days for every month, so a 31st in a shorter month counts as its last.
  const day = Math.min(birth.day, daysIn(birth.year, birth.month));
  const birthDate = `${birth.year}-${pad(birth.month)}-${pad(day)}`;
  const age = ageOn(birthDate);
  const ageValid = age >= MIN_AGE && age <= MAX_AGE;

  const ready = (step !== 'sex' || sex !== null) && (step !== 'birthDate' || ageValid);

  // Activity and goal first: the last required value completes the profile and
  // the layout leaves this screen right away.
  const finish = async () => {
    setSaving(true);
    try {
      await setProfileField('activity', activity);
      await setProfileField('goal', goal);
      if (steps.includes('height')) {
        await setProfileField('heightCm', Math.round(displayToCm(height)));
      }
      if (steps.includes('birthDate')) await setProfileField('birthDate', birthDate);
      if (steps.includes('weight')) saveBodyWeight(displayToKg(weight));
      if (steps.includes('sex') && sex) await setProfileField('sex', sex);
    } finally {
      setSaving(false);
    }
  };

  const { icon, title, why } = STEPS[step];
  return (
    <Screen title={t`Кілька даних про тебе`} mode="root">
      <Text variant="secondary">
        {t`Без них застосунок не порахує твою норму калорій, води та індекс маси тіла. Змінити все це можна будь-коли в профілі.`}
      </Text>

      <Row style={styles.dots}>
        {steps.map((s, i) => (
          <View key={s} style={[styles.dot, i <= index && styles.dotDone]} />
        ))}
        <Text variant="muted" style={styles.counter}>
          {index + 1} / {steps.length}
        </Text>
      </Row>

      <Card>
        <Row>
          <Ionicons name={icon} size={20} color={colors.accent} />
          <Text variant="heading">{title()}</Text>
        </Row>
        <Text variant="muted">{why()}</Text>

        {step === 'birthDate' && (
          <>
            <Row style={styles.wheels}>
              <Wheel
                value={birth.day}
                min={1}
                max={31}
                step={1}
                unit=""
                format={formatPlain}
                rows={5}
                onChange={(v) => setBirth((b) => ({ ...b, day: v }))}
              />
              <Wheel
                value={birth.month}
                min={1}
                max={12}
                step={1}
                unit=""
                format={formatMonth}
                rows={5}
                onChange={(v) => setBirth((b) => ({ ...b, month: v }))}
              />
              <Wheel
                value={birth.year}
                min={THIS_YEAR - MAX_AGE}
                max={THIS_YEAR - MIN_AGE}
                step={1}
                unit=""
                format={formatPlain}
                rows={5}
                onChange={(v) => setBirth((b) => ({ ...b, year: v }))}
              />
            </Row>
            <Text variant="muted" style={[styles.center, !ageValid && styles.error]}>
              {ageValid
                ? `${t`Вік`}: ${age}`
                : t`Вік має бути від ${MIN_AGE} до ${MAX_AGE} років.`}
            </Text>
          </>
        )}

        {step === 'height' && (
          <Wheel
            value={height}
            min={HEIGHT_RANGE[0]}
            max={HEIGHT_RANGE[1]}
            step={1}
            unit={HEIGHT_UNIT}
            format={formatHeight}
            rows={5}
            ticks
            onChange={setHeight}
          />
        )}

        {step === 'weight' && (
          <>
            <Text style={styles.amount}>
              {weight.toFixed(1)}
              <Text style={styles.unit}> {WEIGHT_UNIT}</Text>
            </Text>
            <WeightRuler value={weight} onChange={setWeight} />
          </>
        )}
      </Card>

      {/* Chips and options share the card's colour, so they sit on the screen instead. */}
      {step === 'sex' && (
        <ChipGroup options={SEXES} value={sex} onChange={setSex} labels={SEX_LABELS} />
      )}

      {step === 'activity' && (
        <>
          <ActivityPicker value={activity} onChange={setActivity} />
          <Text variant="caption">{t`Мета`}</Text>
          <ChipGroup options={WEIGHT_GOALS} value={goal} onChange={setGoal} labels={GOAL_LABELS} />
        </>
      )}

      <Button
        title={last ? t`Готово` : t`Далі`}
        trailingIcon={last ? 'checkmark' : 'arrow-forward'}
        onPress={last ? finish : () => setIndex(index + 1)}
        loading={saving}
        disabled={!ready}
      />
      {index > 0 && (
        <Button
          title={t`Назад`}
          variant="ghost"
          icon="arrow-back"
          onPress={() => setIndex(index - 1)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dots: { gap: spacing.xs },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surface },
  dotDone: { backgroundColor: colors.accent },
  counter: { marginLeft: spacing.xs },
  wheels: { gap: 0 },
  center: { textAlign: 'center' },
  error: { color: colors.danger },
  amount: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
  },
  unit: { color: colors.textSecondary, fontSize: fontSize.lg, fontWeight: '600' },
});
