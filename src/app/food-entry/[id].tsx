import { t } from '@lingui/core/macro';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  digits,
  KcalInput,
  MacroInputRow,
  NameInput,
  type MacroInputValues,
} from '@/components/food-card-inputs';
import { MealPicker } from '@/components/meal-picker';
import {
  Button,
  Card,
  CircleButton,
  Field,
  goBack,
  Loading,
  Row,
  Screen,
  Text,
} from '@/components/ui';
import { deleteFoodEntry, getFoodEntry, updateFoodEntry } from '@/db/food';
import type { FoodEntry } from '@/db/schema';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import { formatGrams, formatKcal } from '@/lib/food';
import { mealAt, type Meal } from '@/lib/meals';
import { parseDecimal } from '@/lib/metrics';
import { colors, fontSize, spacing } from '@/theme';

const MAX_AMOUNT = 5000;

const MACRO_KEYS = ['kcal', 'proteinG', 'fatG', 'carbsG'] as const;

/** A number for a field: whole above 10, one decimal below. */
const fieldText = (n: number) => String(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

export default function FoodEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: entry } = useFocusedDbQuery(() => getFoodEntry(Number(id)), [id]);
  if (entry === undefined) return <Loading />;
  if (entry === null) {
    return (
      <Screen title={t`Страва`} mode="modal">
        <Text variant="muted">{t`Запис не знайдено`}</Text>
      </Screen>
    );
  }
  return <EntryEditor key={entry.id} entry={entry} />;
}

/**
 * Changes a logged dish. A new amount scales its nutrition from what was logged;
 * the numbers can also be fixed by hand.
 */
function EntryEditor({ entry }: { entry: FoodEntry }) {
  const [name, setName] = useState(entry.name);
  const [meal, setMeal] = useState<Meal>(entry.meal ?? mealAt(entry.eatenAt));
  const [amount, setAmount] = useState(entry.grams ? fieldText(entry.grams) : '');
  const [values, setValues] = useState<MacroInputValues>(() => ({
    kcal: fieldText(entry.kcal),
    proteinG: fieldText(entry.proteinG),
    fatG: fieldText(entry.fatG),
    carbsG: fieldText(entry.carbsG),
  }));
  const [saving, setSaving] = useState(false);
  // Entries log the amount in their portion text: "250 мл" for drinks.
  const unit = entry.portion?.match(/(мл|ml)$/) ? t`мл` : t`г`;
  const grams = parseDecimal(amount);
  const amountValid = !entry.grams || (grams !== null && grams > 0 && grams <= MAX_AMOUNT);
  const valid =
    name.trim() !== '' &&
    amountValid &&
    MACRO_KEYS.every((key) => parseDecimal(values[key]) !== null);

  const kcal = parseDecimal(values.kcal);
  const stepSize = unit === t`мл` ? 50 : 10;
  const step = (delta: number) =>
    changeAmount(String(Math.round(Math.min(Math.max((grams ?? 0) + delta, stepSize), MAX_AMOUNT))));

  const changeAmount = (text: string) => {
    setAmount(text);
    const next = parseDecimal(text);
    if (!entry.grams || !next || next > MAX_AMOUNT) return;
    const k = next / entry.grams;
    setValues({
      kcal: fieldText(entry.kcal * k),
      proteinG: fieldText(entry.proteinG * k),
      fatG: fieldText(entry.fatG * k),
      carbsG: fieldText(entry.carbsG * k),
    });
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    // Fiber and sugar have no fields: they follow the amount.
    const k = entry.grams && grams ? grams / entry.grams : 1;
    try {
      await updateFoodEntry(entry.id, {
        name: name.trim(),
        meal,
        grams: entry.grams ? grams : entry.grams,
        portion: entry.grams && grams ? `${formatGrams(grams)} ${unit}` : entry.portion,
        kcal: parseDecimal(values.kcal) ?? 0,
        proteinG: parseDecimal(values.proteinG) ?? 0,
        fatG: parseDecimal(values.fatG) ?? 0,
        carbsG: parseDecimal(values.carbsG) ?? 0,
        fiberG: entry.fiberG === null ? null : entry.fiberG * k,
        sugarG: entry.sugarG === null ? null : entry.sugarG * k,
      });
      goBack();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await deleteFoodEntry(entry.id);
    goBack();
  };

  return (
    <Screen
      title={t`Редагувати страву`}
      mode="modal"
      headerRight={<CircleButton icon="trash-outline" onPress={remove} />}>
      <MealPicker meal={meal} onChange={setMeal} />
      <Card style={styles.card}>
        <View>
          <NameInput value={name} onChangeText={setName} />
          {!!entry.grams && grams !== null && grams > 0 && kcal !== null && (
            <Text variant="muted" style={styles.per100}>
              {formatKcal((kcal / grams) * 100)} {t`ккал`} / 100 {unit}
            </Text>
          )}
        </View>
        <KcalInput value={values.kcal} onChangeText={(t) => setValues({ ...values, kcal: t })} />
        <MacroInputRow values={values} onChange={(key, t) => setValues({ ...values, [key]: t })} />
        {!!entry.grams && (
          <>
            <Text variant="body">{t`Кількість`}</Text>
            <Row style={styles.amountRow}>
              <CircleButton
                icon="remove"
                size={40}
                disabled={!grams || grams <= stepSize}
                onPress={() => step(-stepSize)}
              />
              <Field
                value={amount}
                onChangeText={(t) => changeAmount(digits(t))}
                keyboardType="decimal-pad"
                selectTextOnFocus
                maxLength={6}
                containerStyle={styles.flex}
                style={styles.amountInput}
              />
              <Text variant="heading" style={styles.unit}>
                {unit}
              </Text>
              <CircleButton
                icon="add"
                size={40}
                disabled={grams !== null && grams >= MAX_AMOUNT}
                onPress={() => step(stepSize)}
              />
            </Row>
          </>
        )}
        <Row>
          <Button
            title={t`Скасувати`}
            variant="secondary"
            onPress={goBack}
            style={styles.flex}
          />
          <Button
            title={t`Зберегти`}
            icon="checkmark"
            onPress={save}
            loading={saving}
            disabled={!valid}
            style={styles.flex}
          />
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderWidth: 1, borderColor: colors.accent },
  per100: { marginTop: spacing.xs },
  amountRow: { gap: spacing.sm },
  amountInput: { textAlign: 'center', fontSize: fontSize.xl, fontWeight: '700' },
  unit: { color: colors.textSecondary, minWidth: 28 },
});
