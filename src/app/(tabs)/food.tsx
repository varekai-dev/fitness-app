import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { useTabBarSpace } from '@/components/floating-tab-bar';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import {
  Badge,
  Button,
  Card,
  ChipScroller,
  CircleButton,
  EmptyState,
  Field,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import {
  deleteFood,
  deleteFoodEntry,
  loadFood,
  logFood,
  lookupFood,
  searchFoods,
} from '@/db/food';
import type { Food } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import {
  amountUnit,
  formatGrams,
  formatKcal,
  normalizeDish,
  scaleNutrition,
  type Macros,
} from '@/lib/food';
import { GroqError } from '@/lib/groq';
import { WEEKDAY_SHORT, weekdayIndex } from '@/lib/labels';
import { parseDecimal } from '@/lib/metrics';
import { colors, fontSize, radius, spacing } from '@/theme';

const timeFormatter = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const CHART_HEIGHT = 100;
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

export default function FoodScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(() => loadFood());
  const [input, setInput] = useState('');
  const { data: suggestions } = useDbQuery(() => searchFoods(input), [input]);
  const [looking, setLooking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const { goal, todayEntries, totals, days, today, recent } = data;
  const left = goal - totals.kcal;

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
              { text: 'Налаштування', onPress: () => router.push('/settings') },
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
    await logFood(pending.food, amount, pending.isDrink);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPending(null);
  };

  const remove = (id: number, label: string, close: () => void) =>
    dialog.show({
      title: 'Видалити запис?',
      message: label,
      buttons: [
        { text: 'Скасувати', style: 'cancel', onPress: close },
        { text: 'Видалити', style: 'destructive', onPress: () => deleteFoodEntry(id) },
      ],
    });

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
  const chartMax = Math.max(goal, ...days.map((d) => d.kcal));

  return (
    <Screen
      title="Харчування"
      mode="root"
      bottomSpace={tabBarSpace}
      headerRight={
        <CircleButton icon="settings-outline" onPress={() => router.push('/settings')} />
      }>
      <Card style={styles.hero} onPress={() => router.push('/settings')}>
        <Text style={styles.amount}>
          {formatKcal(totals.kcal)}
          <Text style={styles.unit}> ккал</Text>
        </Text>
        <Text variant="muted">
          {left >= 0
            ? `ще ${formatKcal(left)} з ${formatKcal(goal)}`
            : `понад ціль на ${formatKcal(-left)}`}
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.min(totals.kcal / goal, 1) * 100}%` },
              left < 0 && styles.fillOver,
            ]}
          />
        </View>
        <MacroRow macros={totals} />
      </Card>

      <Card>
        <Field
          value={input}
          onChangeText={setInput}
          placeholder="Що з’їв чи випив? Напр. «2 яйця і тост з маслом»"
          multiline
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

      {pending && (
        <PendingCard
          pending={pending}
          onChange={(patch) => setPending({ ...pending, ...patch })}
          onAdd={add}
          onCancel={() => setPending(null)}
        />
      )}

      {recent.length > 0 && !pending && (
        <>
          <Text variant="caption">Нещодавні</Text>
          <ChipScroller>
            {recent.map((f) => (
              <RecentChip key={f.id} food={f} onPick={() => pick(f)} onRemove={() => forget(f)} />
            ))}
          </ChipScroller>
        </>
      )}

      <SectionHeader title="Сьогодні" />
      {todayEntries.length === 0 ? (
        <EmptyState
          icon="restaurant-outline"
          title="Ще нічого не з’їдено"
          hint="Опиши страву вище — AI порахує калорії та БЖВ."
        />
      ) : (
        [...todayEntries].reverse().map((e) => {
          const time = timeFormatter.format(new Date(e.eatenAt));
          return (
            <SwipeToDelete
              key={e.id}
              onDelete={(close) => remove(e.id, `${time} · ${e.name}`, close)}>
              <Card>
                <Row style={styles.spaceBetween}>
                  <View style={styles.flex}>
                    <Text variant="body" numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text variant="muted" numberOfLines={1}>
                      {time}
                      {e.portion ? ` · ${e.portion}` : ''}
                    </Text>
                  </View>
                  <Text variant="heading">{formatKcal(e.kcal)} ккал</Text>
                </Row>
                <Text variant="caption">
                  Б {formatGrams(e.proteinG)} · Ж {formatGrams(e.fatG)} · В {formatGrams(e.carbsG)}{' '}
                  г
                </Text>
              </Card>
            </SwipeToDelete>
          );
        })
      )}

      <Card>
        <Text variant="caption">Останні 7 днів</Text>
        <View style={styles.chart}>
          {days.map((d) => (
            <View key={d.dayStart} style={styles.barColumn}>
              <Text variant="muted" style={styles.barValue} numberOfLines={1}>
                {d.kcal > 0 ? formatKcal(d.kcal) : ''}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.goalLine, { bottom: (goal / chartMax) * CHART_HEIGHT }]} />
                <View
                  style={[
                    styles.bar,
                    { height: Math.max((d.kcal / chartMax) * CHART_HEIGHT, d.kcal ? 4 : 0) },
                    d.kcal > goal && styles.barOver,
                  ]}
                />
              </View>
              <Text variant="caption" style={d.dayStart === today && styles.today}>
                {WEEKDAY_SHORT[weekdayIndex(d.dayStart)]}
              </Text>
            </View>
          ))}
        </View>
      </Card>
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

const MACROS = [
  { key: 'proteinG', label: 'Білки' },
  { key: 'fatG', label: 'Жири' },
  { key: 'carbsG', label: 'Вуглеводи' },
] as const;

function MacroRow({ macros }: { macros: Macros }) {
  return (
    <Row style={styles.macros}>
      {MACROS.map((m) => (
        <View key={m.key} style={styles.macro}>
          <Text variant="heading">{formatGrams(macros[m.key])} г</Text>
          <Text variant="muted">{m.label}</Text>
        </View>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  spaceBetween: { justifyContent: 'space-between' },
  hero: { alignItems: 'center', paddingTop: spacing.xl },
  amount: { color: colors.text, fontSize: fontSize.hero, fontWeight: '800', letterSpacing: -1 },
  unit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  track: {
    alignSelf: 'stretch',
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  fillOver: { backgroundColor: colors.warning },
  macros: { alignSelf: 'stretch', marginTop: spacing.sm },
  macro: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  pending: { borderWidth: 1, borderColor: colors.accent },
  pendingKcal: { color: colors.text, fontSize: fontSize.xxl + 4, fontWeight: '800' },
  stepper: { gap: spacing.sm },
  units: {
    gap: 2,
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
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
  chart: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'flex-end',
  },
  goalLine: {
    position: 'absolute',
    left: -spacing.xs,
    right: -spacing.xs,
    height: 1,
    backgroundColor: colors.textMuted,
  },
  barColumn: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barValue: { fontSize: fontSize.xs - 1 },
  barTrack: { height: CHART_HEIGHT, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm, backgroundColor: colors.accent },
  barOver: { backgroundColor: colors.warning },
  today: { color: colors.accent, fontWeight: '700' },
});
