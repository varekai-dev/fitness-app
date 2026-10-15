import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, ChipGroup, Field, Loading, Row, Screen, Text } from '@/components/ui';
import { loadProfile, setProfileField } from '@/db/profile';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatKcal } from '@/lib/food';
import { formatShortDate } from '@/lib/labels';
import { formatNumber, parseDecimal } from '@/lib/metrics';
import {
  ACTIVITY,
  ACTIVITY_LEVELS,
  ageOn,
  formatBirthDate,
  maskBirthDate,
  missingForRecommendation,
  parseBirthDate,
  recommendCalories,
  SEX_LABELS,
  SEXES,
  WEIGHT_GOAL,
  WEIGHT_GOALS,
  type WeightGoal,
} from '@/lib/profile';
import { colors, fontSize, radius, spacing } from '@/theme';

const GOAL_LABELS = Object.fromEntries(
  WEIGHT_GOALS.map((g) => [g, WEIGHT_GOAL[g].label]),
) as Record<WeightGoal, string>;

export default function ProfileScreen() {
  const { data } = useDbQuery(loadProfile);
  // null until the user types, so the fields show the saved values.
  const [heightInput, setHeightInput] = useState<string | null>(null);
  const [birthInput, setBirthInput] = useState<string | null>(null);

  if (!data) return <Loading />;
  const { profile, latestWeight } = data;
  const weightKg = latestWeight?.weightKg;

  const heightValue = heightInput ?? (profile.heightCm ? formatNumber(profile.heightCm, 1) : '');
  const parsedHeight = parseDecimal(heightValue);
  const heightValid = parsedHeight !== null && parsedHeight >= 100 && parsedHeight <= 250;

  const birthValue = birthInput ?? (profile.birthDate ? formatBirthDate(profile.birthDate) : '');
  const parsedBirth = parseBirthDate(birthValue);

  const changeHeight = (text: string) => {
    setHeightInput(text);
    const h = parseDecimal(text);
    if (h !== null && h >= 100 && h <= 250) setProfileField('heightCm', h);
  };

  const changeBirth = (text: string) => {
    const masked = maskBirthDate(text);
    setBirthInput(masked);
    const iso = parseBirthDate(masked);
    if (iso) setProfileField('birthDate', iso);
  };

  const pick = <K extends 'sex' | 'activity' | 'goal'>(key: K, value: (typeof profile)[K]) => {
    if (profile[key] === value) return;
    Haptics.selectionAsync();
    setProfileField(key, value);
  };

  const rec = recommendCalories(profile, weightKg);
  const missing = missingForRecommendation(profile, weightKg);

  return (
    <Screen title="Профіль">
      <Card onPress={() => router.push('/body-weight')}>
        <Row style={styles.spaceBetween}>
          <Row>
            <Ionicons name="scale-outline" size={20} color={colors.accent} />
            <Text variant="heading">Поточна вага</Text>
          </Row>
          <Row>
            {latestWeight ? (
              <View style={styles.right}>
                <Text variant="heading">{formatNumber(latestWeight.weightKg, 1)} кг</Text>
                <Text variant="muted">{formatShortDate(latestWeight.measuredAt)}</Text>
              </View>
            ) : (
              <Text variant="muted">Додати</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
        </Row>
      </Card>

      <Card>
        <Field
          label="Зріст, см"
          value={heightValue}
          onChangeText={changeHeight}
          keyboardType="decimal-pad"
          placeholder="175"
          maxLength={5}
        />
        {heightValue !== '' && !heightValid && (
          <Text variant="muted" style={styles.error}>
            Вкажи зріст від 100 до 250 см.
          </Text>
        )}
        <Field
          label="Дата народження"
          value={birthValue}
          onChangeText={changeBirth}
          keyboardType="number-pad"
          placeholder="ДД.ММ.РРРР"
          maxLength={10}
        />
        {birthValue.length === 10 && !parsedBirth ? (
          <Text variant="muted" style={styles.error}>
            Перевір дату: формат ДД.ММ.РРРР.
          </Text>
        ) : parsedBirth ? (
          <Text variant="muted">Вік: {ageOn(parsedBirth)}</Text>
        ) : null}
      </Card>

      <Text variant="caption">Стать</Text>
      <ChipGroup
        options={SEXES}
        value={profile.sex}
        onChange={(s) => pick('sex', s)}
        labels={SEX_LABELS}
      />

      <Text variant="caption">Активність</Text>
      <View style={styles.options}>
        {ACTIVITY_LEVELS.map((level) => {
          const selected = profile.activity === level;
          return (
            <Pressable
              key={level}
              onPress={() => pick('activity', level)}
              style={[styles.option, selected && styles.optionSelected]}>
              <View style={styles.flex}>
                <Text variant="body" style={selected && styles.optionText}>
                  {ACTIVITY[level].label}
                </Text>
                <Text variant="muted" style={selected && styles.optionHint}>
                  {ACTIVITY[level].hint}
                </Text>
              </View>
              {selected && <Ionicons name="checkmark" size={20} color={colors.accentText} />}
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption">Мета</Text>
      <ChipGroup
        options={WEIGHT_GOALS}
        value={profile.goal}
        onChange={(g) => pick('goal', g)}
        labels={GOAL_LABELS}
      />

      <Card>
        <Text variant="overline">Рекомендована калорійність</Text>
        {rec ? (
          <>
            <Text style={styles.kcal}>
              {formatKcal(rec.kcal)}
              <Text style={styles.unit}> ккал/день</Text>
            </Text>
            <Text variant="muted">
              Базовий обмін {formatKcal(rec.bmr)} ккал · підтримка {formatKcal(rec.tdee)} ккал
            </Text>
            <Text variant="muted">Формула Міффліна — Сан-Жеора, орієнтовне значення.</Text>
          </>
        ) : (
          <Text variant="muted">Щоб порахувати, вкажи {missing.join(', ')}.</Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spaceBetween: { justifyContent: 'space-between' },
  right: { alignItems: 'flex-end' },
  error: { color: colors.danger },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  optionSelected: { backgroundColor: colors.accent },
  optionText: { color: colors.accentText },
  optionHint: { color: colors.onAccentMuted },
  kcal: { color: colors.text, fontSize: fontSize.hero, fontWeight: '800', letterSpacing: -1 },
  unit: { color: colors.textSecondary, fontSize: fontSize.lg, fontWeight: '600' },
});
