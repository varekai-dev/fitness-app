import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
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
import { useDbQuery } from '@/hooks/use-db-query';
import { formatGrams } from '@/lib/food';
import { tr } from '@/lib/i18n';
import { mealAt, type Meal } from '@/lib/meals';
import { parseDecimal } from '@/lib/metrics';
import { colors, fontSize, spacing } from '@/theme';

const MAX_AMOUNT = 5000;

const MACRO_FIELDS = [
  { key: 'kcal', label: () => tr('Ккал', 'Kcal') },
  { key: 'proteinG', label: () => tr('Білки, г', 'Protein, g') },
  { key: 'fatG', label: () => tr('Жири, г', 'Fat, g') },
  { key: 'carbsG', label: () => tr('Вуглеводи, г', 'Carbs, g') },
] as const;
type MacroKey = (typeof MACRO_FIELDS)[number]['key'];

/** A number for a field: whole above 10, one decimal below. */
const fieldText = (n: number) => String(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const digits = (t: string) => t.replace(/[^\d.,]/g, '');

export default function FoodEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: entry } = useDbQuery(() => getFoodEntry(Number(id)), [id]);
  if (entry === undefined) return <Loading />;
  if (entry === null) {
    return (
      <Screen title={tr('Страва', 'Dish')} mode="modal">
        <Text variant="muted">{tr('Запис не знайдено', 'Entry not found')}</Text>
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
  const dialog = useDialog();
  const [name, setName] = useState(entry.name);
  const [meal, setMeal] = useState<Meal>(entry.meal ?? mealAt(entry.eatenAt));
  const [amount, setAmount] = useState(entry.grams ? fieldText(entry.grams) : '');
  const [values, setValues] = useState<Record<MacroKey, string>>(() => ({
    kcal: fieldText(entry.kcal),
    proteinG: fieldText(entry.proteinG),
    fatG: fieldText(entry.fatG),
    carbsG: fieldText(entry.carbsG),
  }));
  const [saving, setSaving] = useState(false);
  // Entries log the amount in their portion text: "250 мл" for drinks.
  const unit = entry.portion?.match(/(мл|ml)$/) ? tr('мл', 'ml') : tr('г', 'g');
  const grams = parseDecimal(amount);
  const amountValid = !entry.grams || (grams !== null && grams > 0 && grams <= MAX_AMOUNT);
  const valid =
    name.trim() !== '' &&
    amountValid &&
    MACRO_FIELDS.every(({ key }) => parseDecimal(values[key]) !== null);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goBack();
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    dialog.show({
      title: tr('Видалити запис?', 'Delete entry?'),
      message: entry.name,
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        {
          text: tr('Видалити', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteFoodEntry(entry.id);
            goBack();
          },
        },
      ],
    });

  return (
    <Screen
      title={tr('Редагувати страву', 'Edit dish')}
      mode="modal"
      headerRight={<CircleButton icon="trash-outline" onPress={remove} />}>
      <MealPicker meal={meal} onChange={setMeal} />
      <Card>
        <Field label={tr('Назва', 'Name')} value={name} onChangeText={setName} maxLength={80} />
        {!!entry.grams && (
          <Row style={styles.amountRow}>
            <Field
              label={tr('Кількість', 'Amount')}
              value={amount}
              onChangeText={(t) => changeAmount(digits(t))}
              keyboardType="decimal-pad"
              selectTextOnFocus
              maxLength={6}
              containerStyle={styles.flex}
            />
            <Text variant="heading" style={styles.unit}>
              {unit}
            </Text>
          </Row>
        )}
        <View style={styles.macroGrid}>
          {MACRO_FIELDS.map(({ key, label }) => (
            <Field
              key={key}
              label={label()}
              value={values[key]}
              onChangeText={(t) => setValues({ ...values, [key]: digits(t) })}
              keyboardType="decimal-pad"
              selectTextOnFocus
              maxLength={6}
              containerStyle={styles.macroField}
            />
          ))}
        </View>
        <Row>
          <Button
            title={tr('Скасувати', 'Cancel')}
            variant="secondary"
            onPress={goBack}
            style={styles.flex}
          />
          <Button
            title={tr('Зберегти', 'Save')}
            icon="checkmark"
            onPress={save}
            loading={saving}
            disabled={!valid}
            style={styles.flex}
          />
        </Row>
      </Card>
      {dialog.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  amountRow: { alignItems: 'flex-end', gap: spacing.sm },
  unit: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    minWidth: 28,
    paddingBottom: spacing.md,
  },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  macroField: { flexBasis: '45%', flexGrow: 1 },
});
