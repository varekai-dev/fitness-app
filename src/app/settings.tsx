import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, CircleButton, Field, Row, Screen, Text } from '@/components/ui';
import { getKcalGoal, setKcalGoal } from '@/db/food';
import { loadProfile } from '@/db/profile';
import { getWaterGoal, setWaterGoal } from '@/db/water';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatGrams, formatKcal, KCAL_GOAL_STEP, MAX_KCAL_GOAL, MIN_KCAL_GOAL } from '@/lib/food';
import {
  checkGroqKey,
  deleteGroqKey,
  getGroqKey,
  GROQ_MODEL,
  maskKey,
  setGroqKey,
} from '@/lib/groq';
import {
  ACTIVITY,
  missingForRecommendation,
  recommendCalories,
  recommendWater,
  WEIGHT_GOAL,
} from '@/lib/profile';
import { formatMl, MAX_WATER_GOAL_ML, MIN_WATER_GOAL_ML, WATER_GOAL_STEP_ML } from '@/lib/water';
import { colors, fontSize, spacing } from '@/theme';

const KEYS_URL = 'https://console.groq.com/keys';

export default function SettingsScreen() {
  const dialog = useDialog();
  // undefined while loading, null when no key is stored.
  const [savedKey, setSavedKey] = useState<string | null | undefined>(undefined);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getGroqKey()
      .then(setSavedKey)
      .catch(() => setSavedKey(null));
  }, []);

  const save = async () => {
    const key = input.trim();
    if (!key) return;
    setSaving(true);
    try {
      const check = await checkGroqKey(key);
      if (check === 'invalid') {
        dialog.show({
          title: 'Ключ не підходить',
          message: 'Groq відхилив цей ключ. Скопіюй його ще раз з консолі Groq.',
          icon: 'alert-circle',
        });
        return;
      }
      await setGroqKey(key);
      setSavedKey(key);
      setInput('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (check === 'error') {
        dialog.show({
          title: 'Ключ збережено',
          message: 'Не вдалося перевірити його зараз — перевіримо під час першого запиту.',
        });
      }
    } catch (e) {
      dialog.show({ title: 'Не вдалося зберегти', message: String(e), icon: 'alert-circle' });
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    dialog.show({
      title: 'Видалити ключ?',
      message: 'Нові страви не будуть розраховуватися, доки не додаси ключ знову.',
      buttons: [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => deleteGroqKey().then(() => setSavedKey(null)),
        },
      ],
    });

  return (
    <Screen title="Налаштування">
      <Card onPress={() => router.push('/profile')}>
        <Row style={styles.spaceBetween}>
          <Row>
            <Ionicons name="person-outline" size={20} color={colors.accent} />
            <Text variant="heading">Профіль</Text>
          </Row>
          <Row>
            <Text variant="muted">Вага, зріст, вік</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
        </Row>
      </Card>

      <GoalsSection />

      <Text variant="overline">Groq AI</Text>
      <Card>
        <Row>
          <Ionicons name="key-outline" size={20} color={colors.accent} />
          <Text variant="heading">Ключ Groq API</Text>
        </Row>
        <Text variant="muted">
          Потрібен, щоб рахувати калорії та БЖВ страв. Ключ зберігається лише на цьому пристрої в
          захищеному сховищі. Модель: {GROQ_MODEL}.
        </Text>
        {savedKey ? (
          <Row style={styles.saved}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text variant="body" style={styles.flex}>
              {maskKey(savedKey)}
            </Text>
            <Button title="Видалити" variant="danger" small onPress={remove} />
          </Row>
        ) : savedKey === null ? (
          <Text variant="caption">Ключ ще не додано.</Text>
        ) : null}
        <Field
          value={input}
          onChangeText={setInput}
          placeholder={savedKey ? 'Новий ключ, щоб замінити' : 'gsk_…'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          onSubmitEditing={save}
        />
        <Button
          title={savedKey ? 'Замінити ключ' : 'Зберегти ключ'}
          icon="save-outline"
          onPress={save}
          loading={saving}
          disabled={!input.trim()}
        />
        <Button
          title="Отримати ключ у консолі Groq"
          variant="ghost"
          small
          trailingIcon="open-outline"
          onPress={() => WebBrowser.openBrowserAsync(KEYS_URL)}
        />
      </Card>

      {dialog.element}
    </Screen>
  );
}

/** Next value on the `step` grid, so a recommended 2137 steps to 2150 / 2100 rather than 2187 / 2087. */
const snapStep = (value: number, step: number, dir: 1 | -1) =>
  dir > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;

/** A daily goal edited with −/+ on a step grid, clamped to [min, max]. */
function GoalStepper({
  title,
  unit,
  value,
  step,
  min,
  max,
  format,
  onChange,
}: {
  title: string;
  unit: string;
  value: number;
  step: number;
  min: number;
  max: number;
  format: (n: number) => string;
  onChange: (next: number) => void;
}) {
  const change = (dir: 1 | -1) => {
    const next = Math.min(Math.max(snapStep(value, step, dir), min), max);
    if (next === value) return;
    Haptics.selectionAsync();
    onChange(next);
  };
  return (
    <Card>
      <Row style={styles.spaceBetween}>
        <View>
          <Text variant="heading">{title}</Text>
          <Text variant="muted">
            Крок {step} {unit}
          </Text>
        </View>
        <Row style={styles.stepper}>
          <CircleButton
            icon="remove"
            size={36}
            disabled={value <= min}
            onPress={() => change(-1)}
          />
          <Text variant="heading" style={styles.goalValue}>
            {format(value)} {unit}
          </Text>
          <CircleButton icon="add" size={36} disabled={value >= max} onPress={() => change(1)} />
        </Row>
      </Row>
    </Card>
  );
}

/**
 * The profile-based recommendation for a goal, with a button to adopt it.
 * Without one it says which profile fields are still missing.
 */
function RecommendationCard({
  value,
  goal,
  unit,
  format,
  details,
  missing,
  onAdopt,
}: {
  value: number | null;
  goal: number;
  unit: string;
  format: (n: number) => string;
  details: string;
  missing: string;
  onAdopt: (value: number) => void;
}) {
  return (
    <Card onPress={() => router.push('/profile')}>
      <Row style={styles.spaceBetween}>
        <Text variant="overline">Рекомендовано</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
      {value !== null ? (
        <>
          <Text variant="title">
            {format(value)}
            <Text style={styles.recUnit}> {unit}/день</Text>
          </Text>
          <Text variant="muted">{details}</Text>
          {value !== goal && (
            <Button
              title={`Зробити ціллю (зараз ${format(goal)})`}
              variant="secondary"
              small
              onPress={() => {
                Haptics.selectionAsync();
                onAdopt(value);
              }}
            />
          )}
        </>
      ) : (
        <Text variant="muted">Вкажи в профілі {missing}, щоб отримати рекомендацію.</Text>
      )}
    </Card>
  );
}

/** Daily kcal and water goals, each with its profile-based recommendation. */
function GoalsSection() {
  const { data } = useDbQuery(() => Promise.all([getKcalGoal(), getWaterGoal(), loadProfile()]));
  if (!data) return null;
  const [kcalGoal, waterGoal, { profile, latestWeight }] = data;
  const weightKg = latestWeight?.weightKg;
  const kcal = recommendCalories(profile, weightKg);
  const water = recommendWater(profile, weightKg);
  const activity = `${ACTIVITY[profile.activity].label.toLowerCase()} активність`;

  return (
    <>
      <Text variant="overline">Харчування</Text>
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

      <Text variant="overline">Вода</Text>
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
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stepper: { gap: spacing.sm },
  goalValue: { minWidth: 96, textAlign: 'center' },
  recUnit: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600' },
  saved: { marginVertical: spacing.xs },
  spaceBetween: { justifyContent: 'space-between' },
});
