import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { MacroRow } from '@/components/macro-row';
import {
  Badge,
  Button,
  Card,
  CircleButton,
  Field,
  goBack,
  Row,
  Screen,
  Text,
} from '@/components/ui';
import { deleteFood, loadFood, logFood, lookupFood, searchFoods } from '@/db/food';
import type { Food } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { amountUnit, formatGrams, formatKcal, normalizeDish, scaleNutrition } from '@/lib/food';
import { GroqError } from '@/lib/groq';
import { MEAL_LABELS, MEALS, mealAt, type Meal } from '@/lib/meals';
import { parseDecimal } from '@/lib/metrics';
import { addDays, startOfDay } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

// Drinks come in bigger round volumes, so they step faster.
const amountStep = (isDrink: boolean) => (isDrink ? 50 : 10);
const MAX_AMOUNT = 5000;

/**
 * A dish waiting to be logged. `amount` is the raw field text (grams, or ml when
 * `isDrink`), so the user can clear it while typing; `isDrink` starts from the
 * AI's guess and the user can flip it.
 */
type Pending = { food: Food; cached: boolean; amount: string; isDrink: boolean };

const startPending = (food: Food, cached: boolean): Pending => ({
  food,
  cached,
  amount: String(Math.round(food.portionG ?? 100)),
  isDrink: food.isDrink,
});

function parseAmount(text: string) {
  const a = parseDecimal(text);
  return a !== null && a > 0 && a <= MAX_AMOUNT ? a : null;
}

/** Now, or the same time of day on `day` (its local midnight) when logging a past day. */
function eatenAt(day?: string) {
  const now = Date.now();
  const start = Number(day);
  if (!day || !Number.isFinite(start)) return now;
  return Math.min(start + (now - startOfDay(now)), addDays(start, 1) - 1, now);
}

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ meal?: string; day?: string }>();
  // Opened without a meal (e.g. a deep link): pick it by the time of day.
  const [meal] = useState<Meal>(() => MEALS.find((m) => m === params.meal) ?? mealAt(Date.now()));
  const { data } = useDbQuery(() => loadFood());
  const [input, setInput] = useState('');
  const { data: suggestions } = useDbQuery(() => searchFoods(input), [input]);
  const [looking, setLooking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const dialog = useDialog();

  const lookup = async (text: string) => {
    if (!text.trim() || looking) return;
    setLooking(true);
    try {
      const result = await lookupFood(text);
      setPending(startPending(result.food, result.cached));
      setInput('');
    } catch (e) {
      const noKey = e instanceof GroqError && (e.kind === 'no-key' || e.kind === 'auth');
      dialog.show({
        title: 'Не вдалося порахувати',
        message: (e as Error).message,
        icon: 'alert-circle',
        buttons: noKey
          ? [
              { text: 'Скасувати', style: 'cancel' },
              { text: 'Налаштування', onPress: () => router.push('/settings/integrations') },
            ]
          : undefined,
      });
    } finally {
      setLooking(false);
    }
  };

  const pick = (food: Food) => {
    // Dishes cached before portions had a weight need a fresh estimate to scale by grams.
    if (!food.portionG) return lookup(food.query);
    setPending(startPending(food, true));
    setInput('');
  };

  const add = async () => {
    const amount = pending && parseAmount(pending.amount);
    if (!pending || !amount) return;
    await logFood(pending.food, amount, meal, pending.isDrink, eatenAt(params.day));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    goBack();
  };

  // Removes the dish from the cache only; meals already logged keep their values.
  const forget = (food: Food) =>
    dialog.show({
      title: 'Прибрати з нещодавніх?',
      message: `«${food.name}» зникне зі списку й підказок. Записи в журналі залишаться, а наступного разу страву порахує AI.`,
      buttons: [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Прибрати', style: 'destructive', onPress: () => deleteFood(food.id) },
      ],
    });

  const typed = normalizeDish(input);
  // Hide the suggestion that exactly matches: submitting already reuses it.
  const shownSuggestions = typed ? (suggestions ?? []).filter((f) => f.query !== typed) : [];
  const recent = data?.recent ?? [];

  return (
    <Screen title={MEAL_LABELS[meal]} mode="modal">
      {pending ? (
        <PendingCard
          pending={pending}
          onChange={(patch) => setPending({ ...pending, ...patch })}
          onAdd={add}
          onCancel={() => setPending(null)}
        />
      ) : (
        <>
          <Card>
            <Field
              value={input}
              onChangeText={setInput}
              placeholder="Що з’їв чи випив? Напр. «2 яйця і тост з маслом»"
              multiline
              autoFocus
              editable={!looking}
            />
            {shownSuggestions.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => pick(f)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Text variant="body" style={styles.flex} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text variant="muted">{formatKcal(f.kcal)} ккал</Text>
              </Pressable>
            ))}
            <Button
              title={looking ? 'Рахую…' : 'Порахувати'}
              icon="sparkles"
              onPress={() => lookup(input)}
              loading={looking}
              disabled={!input.trim()}
            />
          </Card>
          {recent.length > 0 && (
            <>
              <Text variant="caption">Нещодавні</Text>
              <View style={styles.recentList}>
                {recent.map((f) => (
                  <RecentChip
                    key={f.id}
                    food={f}
                    onPick={() => pick(f)}
                    onRemove={() => forget(f)}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}
      {dialog.element}
    </Screen>
  );
}

function PendingCard({
  pending: { food, cached, amount: amountText, isDrink },
  onChange,
  onAdd,
  onCancel,
}: {
  pending: Pending;
  onChange: (patch: Partial<Pick<Pending, 'amount' | 'isDrink'>>) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const amount = parseAmount(amountText);
  const scaled = scaleNutrition(food, amount ?? 0);
  const per100 = scaleNutrition(food, 100);
  const unit = amountUnit({ isDrink });
  const stepSize = amountStep(isDrink);
  const step = (delta: number) => {
    const next = Math.min(Math.max((amount ?? 0) + delta, stepSize), MAX_AMOUNT);
    Haptics.selectionAsync();
    onChange({ amount: String(Math.round(next)) });
  };
  const setUnit = (drink: boolean) => {
    if (drink === isDrink) return;
    Haptics.selectionAsync();
    onChange({ isDrink: drink });
  };
  return (
    <Card style={styles.pending}>
      <Row style={styles.spaceBetween}>
        <View style={styles.flex}>
          <Text variant="heading">{food.name}</Text>
          <Text variant="muted">
            {cached ? 'Зазвичай' : 'Оцінка AI'}: {formatGrams(food.portionG ?? 100)} {unit} ·{' '}
            {formatKcal(per100.kcal)} ккал / 100 {unit}
          </Text>
        </View>
        <Badge label={cached ? 'З бази' : 'AI'} tone={cached ? 'muted' : 'accent'} />
      </Row>
      <Text style={styles.pendingKcal}>
        {formatKcal(scaled.kcal)}
        <Text style={styles.unit}> ккал</Text>
      </Text>
      <MacroRow macros={scaled} />
      {(scaled.fiberG !== null || scaled.sugarG !== null) && (
        <Text variant="muted">
          {scaled.fiberG !== null ? `Клітковина ${formatGrams(scaled.fiberG)} г` : ''}
          {scaled.fiberG !== null && scaled.sugarG !== null ? ' · ' : ''}
          {scaled.sugarG !== null ? `Цукор ${formatGrams(scaled.sugarG)} г` : ''}
        </Text>
      )}
      <Row style={styles.spaceBetween}>
        <Text variant="body">Кількість</Text>
        <Row style={styles.units}>
          {[false, true].map((drink) => (
            <Pressable
              key={String(drink)}
              onPress={() => setUnit(drink)}
              accessibilityRole="button"
              accessibilityState={{ selected: drink === isDrink }}
              style={[styles.unitChip, drink === isDrink && styles.unitChipActive]}>
              <Text
                variant="body"
                style={[styles.unitText, drink === isDrink && styles.unitTextActive]}>
                {amountUnit({ isDrink: drink })}
              </Text>
            </Pressable>
          ))}
        </Row>
      </Row>
      <Row style={styles.amountRow}>
        <CircleButton
          icon="remove"
          size={40}
          disabled={!amount || amount <= stepSize}
          onPress={() => step(-stepSize)}
        />
        <Field
          value={amountText}
          onChangeText={(t) => onChange({ amount: t.replace(/[^\d.,]/g, '') })}
          keyboardType="decimal-pad"
          selectTextOnFocus
          maxLength={6}
          containerStyle={styles.flex}
          style={styles.amountInput}
        />
        <Text variant="heading" style={styles.amountUnit}>
          {unit}
        </Text>
        <CircleButton
          icon="add"
          size={40}
          disabled={amount !== null && amount >= MAX_AMOUNT}
          onPress={() => step(stepSize)}
        />
      </Row>
      <Row>
        <Button title="Скасувати" variant="secondary" onPress={onCancel} style={styles.flex} />
        <Button title="Додати" icon="add" onPress={onAdd} disabled={!amount} style={styles.flex} />
      </Row>
    </Card>
  );
}

/** A recent dish: tap the name to log it again, the cross to forget it. */
function RecentChip({
  food,
  onPick,
  onRemove,
}: {
  food: Food;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.recent}>
      <Pressable
        onPress={onPick}
        onLongPress={onRemove}
        style={({ pressed }) => [styles.recentName, pressed && styles.pressed]}>
        <Text variant="body" style={styles.recentText} numberOfLines={1}>
          {food.name}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityLabel={`Прибрати «${food.name}» з нещодавніх`}
        style={({ pressed }) => [styles.recentRemove, pressed && styles.pressed]}>
        <Ionicons name="close" size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  spaceBetween: { justifyContent: 'space-between' },
  unit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  pending: { borderWidth: 1, borderColor: colors.accent },
  pendingKcal: { color: colors.text, fontSize: fontSize.xxl + 4, fontWeight: '800' },
  units: {
    gap: 2,
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
  recentList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  recentName: {
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm + 2,
  },
  recentText: { fontSize: fontSize.sm, fontWeight: '600', maxWidth: 180 },
  recentRemove: {
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  unitChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  unitChipActive: { backgroundColor: colors.accent },
  unitText: { color: colors.textSecondary, fontWeight: '700' },
  unitTextActive: { color: colors.accentText },
  amountRow: { gap: spacing.sm },
  amountInput: { textAlign: 'center', fontSize: fontSize.xl, fontWeight: '700' },
  amountUnit: { color: colors.textSecondary, minWidth: 28 },
});
