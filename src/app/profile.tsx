import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityPicker } from '@/components/activity-picker';
import { Card, ChipGroup, Field, Loading, Row, Screen, Text } from '@/components/ui';
import { loadProfile, setProfileField } from '@/db/profile';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatKcal } from '@/lib/food';
import { tr } from '@/lib/i18n';
import { formatShortDate } from '@/lib/labels';
import { formatNumber, formatWeight, parseDecimal } from '@/lib/metrics';
import {
  ageOn,
  formatBirthDate,
  GOAL_LABELS,
  maskBirthDate,
  missingForRecommendation,
  parseBirthDate,
  recommendCalories,
  SEX_LABELS,
  SEXES,
  WEIGHT_GOALS,
} from '@/lib/profile';
import { cmToDisplay, displayToCm, HEIGHT_UNIT, WEIGHT_UNIT } from '@/lib/units';
import { colors, fontSize } from '@/theme';

const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;
const heightValidCm = (cm: number | null): cm is number =>
  cm !== null && cm >= MIN_HEIGHT_CM && cm <= MAX_HEIGHT_CM;
/** Height range in the chosen unit, for the hint below the field. */
const HEIGHT_RANGE = [MIN_HEIGHT_CM, MAX_HEIGHT_CM].map((cm) => Math.round(cmToDisplay(cm)));

export default function ProfileScreen() {
  const { data } = useDbQuery(loadProfile);
  // null until the user types, so the fields show the saved values.
  const [heightInput, setHeightInput] = useState<string | null>(null);
  const [birthInput, setBirthInput] = useState<string | null>(null);

  if (!data) return <Loading />;
  const { profile, latestWeight } = data;
  const weightKg = latestWeight?.weightKg;

  const heightValue =
    heightInput ?? (profile.heightCm ? formatNumber(cmToDisplay(profile.heightCm), 1) : '');
  const toCm = (text: string) => {
    const h = parseDecimal(text);
    return h === null ? null : displayToCm(h);
  };
  const heightValid = heightValidCm(toCm(heightValue));

  const birthValue = birthInput ?? (profile.birthDate ? formatBirthDate(profile.birthDate) : '');
  const parsedBirth = parseBirthDate(birthValue);

  const changeHeight = (text: string) => {
    setHeightInput(text);
    const cm = toCm(text);
    if (heightValidCm(cm)) setProfileField('heightCm', cm);
  };

  const changeBirth = (text: string) => {
    const masked = maskBirthDate(text);
    setBirthInput(masked);
    const iso = parseBirthDate(masked);
    if (iso) setProfileField('birthDate', iso);
  };

  const pick = <K extends 'sex' | 'activity' | 'goal'>(key: K, value: (typeof profile)[K]) => {
    if (profile[key] === value) return;
    setProfileField(key, value);
  };

  const rec = recommendCalories(profile, weightKg);
  const missing = missingForRecommendation(profile, weightKg);

  return (
    <Screen title={tr('Профіль', 'Profile')}>
      <Card onPress={() => router.push('/body-weight')}>
        <Row style={styles.spaceBetween}>
          <Row>
            <Ionicons name="scale-outline" size={20} color={colors.accent} />
            <Text variant="heading">{tr('Поточна вага', 'Current weight')}</Text>
          </Row>
          <Row>
            {latestWeight ? (
              <View style={styles.right}>
                <Text variant="heading">
                  {formatWeight(latestWeight.weightKg, 1)} {WEIGHT_UNIT}
                </Text>
                <Text variant="muted">{formatShortDate(latestWeight.measuredAt)}</Text>
              </View>
            ) : (
              <Text variant="muted">{tr('Додати', 'Add')}</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
        </Row>
      </Card>

      <Card>
        <Field
          label={`${tr('Зріст', 'Height')}, ${HEIGHT_UNIT}`}
          value={heightValue}
          onChangeText={changeHeight}
          keyboardType="decimal-pad"
          placeholder={String(Math.round(cmToDisplay(175)))}
          maxLength={5}
        />
        {heightValue !== '' && !heightValid && (
          <Text variant="muted" style={styles.error}>
            {tr(
              `Вкажи зріст від ${HEIGHT_RANGE[0]} до ${HEIGHT_RANGE[1]} ${HEIGHT_UNIT}.`,
              `Enter a height from ${HEIGHT_RANGE[0]} to ${HEIGHT_RANGE[1]} ${HEIGHT_UNIT}.`,
            )}
          </Text>
        )}
        <Field
          label={tr('Дата народження', 'Date of birth')}
          value={birthValue}
          onChangeText={changeBirth}
          keyboardType="number-pad"
          placeholder={tr('ДД.ММ.РРРР', 'DD.MM.YYYY')}
          maxLength={10}
        />
        {birthValue.length === 10 && !parsedBirth ? (
          <Text variant="muted" style={styles.error}>
            {tr('Перевір дату: формат ДД.ММ.РРРР.', 'Check the date: the format is DD.MM.YYYY.')}
          </Text>
        ) : parsedBirth ? (
          <Text variant="muted">
            {tr('Вік', 'Age')}: {ageOn(parsedBirth)}
          </Text>
        ) : null}
      </Card>

      <Text variant="caption">{tr('Стать', 'Sex')}</Text>
      <ChipGroup
        options={SEXES}
        value={profile.sex}
        onChange={(s) => pick('sex', s)}
        labels={SEX_LABELS}
      />

      <Text variant="caption">{tr('Активність', 'Activity')}</Text>
      <ActivityPicker value={profile.activity} onChange={(level) => pick('activity', level)} />

      <Text variant="caption">{tr('Мета', 'Goal')}</Text>
      <ChipGroup
        options={WEIGHT_GOALS}
        value={profile.goal}
        onChange={(g) => pick('goal', g)}
        labels={GOAL_LABELS}
      />

      <Card>
        <Text variant="overline">{tr('Рекомендована калорійність', 'Recommended calories')}</Text>
        {rec ? (
          <>
            <Text style={styles.kcal}>
              {formatKcal(rec.kcal)}
              <Text style={styles.unit}> {tr('ккал/день', 'kcal/day')}</Text>
            </Text>
            <Text variant="muted">
              {tr(
                `Базовий обмін ${formatKcal(rec.bmr)} ккал · підтримка ${formatKcal(rec.tdee)} ккал`,
                `BMR ${formatKcal(rec.bmr)} kcal · maintenance ${formatKcal(rec.tdee)} kcal`,
              )}
            </Text>
            <Text variant="muted">
              {tr(
                'Формула Міффліна — Сан-Жеора, орієнтовне значення.',
                'Mifflin–St Jeor formula, an estimate.',
              )}
            </Text>
          </>
        ) : (
          <Text variant="muted">
            {tr(
              `Щоб порахувати, вкажи ${missing.join(', ')}.`,
              `To calculate, enter your ${missing.join(', ')}.`,
            )}
          </Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spaceBetween: { justifyContent: 'space-between' },
  right: { alignItems: 'flex-end' },
  error: { color: colors.danger },
  kcal: { color: colors.text, fontSize: fontSize.hero, fontWeight: '800', letterSpacing: -1 },
  unit: { color: colors.textSecondary, fontSize: fontSize.lg, fontWeight: '600' },
});
