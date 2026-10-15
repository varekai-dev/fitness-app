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
  Chip,
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
  deleteFoodEntry,
  loadFood,
  logFood,
  lookupFood,
  searchFoods,
  setKcalGoal,
} from '@/db/food';
import { loadProfile } from '@/db/profile';
import type { Food } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatGrams, formatKcal, normalizeDish, type Macros } from '@/lib/food';
import { GroqError } from '@/lib/groq';
import { WEEKDAY_SHORT, weekdayIndex } from '@/lib/labels';
import { ACTIVITY, missingForRecommendation, recommendCalories, WEIGHT_GOAL } from '@/lib/profile';
import { colors, fontSize, radius, spacing } from '@/theme';

const timeFormatter = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const CHART_HEIGHT = 100;
const SERVING_STEP = 0.5;

type Pending = { food: Food; cached: boolean; servings: number };

export default function FoodScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(() => loadFood());
  const [input, setInput] = useState('');
  const { data: suggestions } = useDbQuery(() => searchFoods(input), [input]);
  const { data: profileData } = useDbQuery(loadProfile);
  const [looking, setLooking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const dialog = useDialog();

  if (!data || !profileData) return <Loading />;
  const { goal, todayEntries, totals, days, today, recent } = data;
  const { profile, latestWeight } = profileData;
  const rec = recommendCalories(profile, latestWeight?.weightKg);
  const left = goal - totals.kcal;

  const lookup = async (text: string) => {
    if (!text.trim() || looking) return;
    setLooking(true);
    try {
      const result = await lookupFood(text);
      setPending({ ...result, servings: 1 });
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
    setPending({ food, cached: true, servings: 1 });
    setInput('');
  };

  const add = async () => {
    if (!pending) return;
    await logFood(pending.food, pending.servings);
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
        <>
          <CircleButton icon="person-outline" onPress={() => router.push('/profile')} />
          <CircleButton icon="settings-outline" onPress={() => router.push('/settings')} />
        </>
      }>
      <Card style={styles.hero}>
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

      <Card onPress={() => router.push('/profile')}>
        <Row style={styles.spaceBetween}>
          <Text variant="overline">Рекомендовано</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Row>
        {rec ? (
          <>
            <Text variant="title">
              {formatKcal(rec.kcal)}
              <Text style={styles.recUnit}> ккал/день</Text>
            </Text>
            <Text variant="muted">
              {WEIGHT_GOAL[profile.goal].label} · {ACTIVITY[profile.activity].label.toLowerCase()}{' '}
              активність · {rec.age} р.
            </Text>
            {rec.kcal !== goal && (
              <Button
                title={`Зробити ціллю (зараз ${formatKcal(goal)})`}
                variant="secondary"
                small
                onPress={() => {
                  Haptics.selectionAsync();
                  setKcalGoal(rec.kcal);
                }}
              />
            )}
          </>
        ) : (
          <Text variant="muted">
            Вкажи в профілі {missingForRecommendation(profile, latestWeight?.weightKg).join(', ')},
            щоб отримати рекомендовану калорійність.
          </Text>
        )}
      </Card>

      <Card>
        <Field
          value={input}
          onChangeText={setInput}
          placeholder="Що з’їв? Напр. «2 яйця і тост з маслом»"
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
          onServings={(servings) => setPending({ ...pending, servings })}
          onAdd={add}
          onCancel={() => setPending(null)}
        />
      )}

      {recent.length > 0 && !pending && (
        <>
          <Text variant="caption">Нещодавні</Text>
          <ChipScroller>
            {recent.map((f) => (
              <Chip key={f.id} label={f.name} selected={false} onPress={() => pick(f)} />
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
  pending: { food, cached, servings },
  onServings,
  onAdd,
  onCancel,
}: {
  pending: Pending;
  onServings: (servings: number) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const scaled: Macros = {
    kcal: food.kcal * servings,
    proteinG: food.proteinG * servings,
    fatG: food.fatG * servings,
    carbsG: food.carbsG * servings,
  };
  return (
    <Card style={styles.pending}>
      <Row style={styles.spaceBetween}>
        <View style={styles.flex}>
          <Text variant="heading">{food.name}</Text>
          {food.portion && <Text variant="muted">{food.portion}</Text>}
        </View>
        <Badge label={cached ? 'З бази' : 'AI'} tone={cached ? 'muted' : 'accent'} />
      </Row>
      <Text style={styles.pendingKcal}>
        {formatKcal(scaled.kcal)}
        <Text style={styles.unit}> ккал</Text>
      </Text>
      <MacroRow macros={scaled} />
      {(food.fiberG !== null || food.sugarG !== null) && (
        <Text variant="muted">
          {food.fiberG !== null ? `Клітковина ${formatGrams(food.fiberG * servings)} г` : ''}
          {food.fiberG !== null && food.sugarG !== null ? ' · ' : ''}
          {food.sugarG !== null ? `Цукор ${formatGrams(food.sugarG * servings)} г` : ''}
        </Text>
      )}
      <Row style={styles.spaceBetween}>
        <Text variant="body">Порцій</Text>
        <Row style={styles.stepper}>
          <CircleButton
            icon="remove"
            size={36}
            disabled={servings <= SERVING_STEP}
            onPress={() => onServings(servings - SERVING_STEP)}
          />
          <Text variant="heading" style={styles.servings}>
            {formatGrams(servings)}
          </Text>
          <CircleButton icon="add" size={36} onPress={() => onServings(servings + SERVING_STEP)} />
        </Row>
      </Row>
      <Row>
        <Button title="Скасувати" variant="secondary" onPress={onCancel} style={styles.flex} />
        <Button title="Додати" icon="add" onPress={onAdd} style={styles.flex} />
      </Row>
    </Card>
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
  recUnit: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600' },
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
  servings: { minWidth: 40, textAlign: 'center' },
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
