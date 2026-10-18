import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CalorieSummary } from '@/components/calorie-summary';
import { DayReviewCard } from '@/components/day-review-card';
import { useDialog } from '@/components/dialog';
import { MealAdvice } from '@/components/meal-advice';
import { useTabBarSpace } from '@/components/floating-tab-bar';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import {
  Button,
  Card,
  CircleButton,
  IconButton,
  Loading,
  Row,
  Screen,
  Text,
} from '@/components/ui';
import {
  deleteFoodEntry,
  deleteMealTemplate,
  loadFood,
  repeatMeal,
  saveMealTemplate,
} from '@/db/food';
import type { FoodEntry, Meal } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { useToday } from '@/hooks/use-today';
import { describeDishes, formatGrams, formatKcal } from '@/lib/food';
import { locale, tr } from '@/lib/i18n';
import { formatLongDate, formatShortDate, WEEKDAY_SHORT, weekdayIndex } from '@/lib/labels';
import { MAIN_MEALS, MEAL_ICONS, MEAL_LABELS, MEALS, mealOf } from '@/lib/meals';
import { addDays } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
const CHART_HEIGHT = 100;

export default function FoodScreen() {
  const tabBarSpace = useTabBarSpace();
  const today = useToday();
  // Counted back from today, so the selection follows the day rolling over.
  const [daysAgo, setDaysAgo] = useState(0);
  const day = addDays(today, -daysAgo);
  const { data } = useDbQuery(() => loadFood(Date.now(), day), [day]);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const {
    goal,
    dayEntries,
    totals,
    days,
    previous,
    templates,
    shortcuts,
    review,
    reviewState,
    mealAdvice,
  } = data;

  const repeat = async (meal: Meal, entries: FoodEntry[]) => {
    await repeatMeal(entries, meal, day);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const unsaveTemplate = async (id: number) => {
    await deleteMealTemplate(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveTemplate = async (entries: FoodEntry[]) => {
    const name = await saveMealTemplate(entries);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dialog.show({
      title: tr('Збережено як шаблон', 'Saved as a template'),
      message: tr(
        `«${name}» тепер можна додати в один тап з екрана додавання їжі.`,
        `“${name}” can now be added in one tap from the add food screen.`,
      ),
      icon: 'bookmark',
    });
  };

  const remove = (id: number, label: string, close: () => void) =>
    dialog.show({
      title: tr('Видалити запис?', 'Delete entry?'),
      message: label,
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel', onPress: close },
        {
          text: tr('Видалити', 'Delete'),
          style: 'destructive',
          onPress: () => deleteFoodEntry(id),
        },
      ],
    });

  const chartMax = Math.max(goal, ...days.map((d) => d.kcal));

  return (
    <Screen
      title={tr('Харчування', 'Food')}
      mode="root"
      bottomSpace={tabBarSpace}
      headerRight={
        <CircleButton icon="settings-outline" onPress={() => router.push('/settings')} />
      }>
      <CalorieSummary
        totals={totals}
        goal={goal}
        onPress={() => router.push('/settings/food')}
        onMacroPress={(macro) =>
          router.push({ pathname: '/macro', params: { macro, day: String(day) } })
        }
      />

      <Row style={styles.dayNav}>
        <CircleButton icon="chevron-back" size={36} onPress={() => setDaysAgo(daysAgo + 1)} />
        <View style={styles.dayTitle}>
          <Text variant="heading">
            {daysAgo === 0 ? tr('Сьогодні', 'Today') : formatLongDate(day)}
          </Text>
        </View>
        <CircleButton
          icon="chevron-forward"
          size={36}
          disabled={daysAgo === 0}
          onPress={() => setDaysAgo(daysAgo - 1)}
        />
      </Row>

      {dayEntries.length > 0 && (
        <DayReviewCard
          key={day}
          day={day}
          isToday={daysAgo === 0}
          stored={review}
          state={reviewState}
          kcalGoal={goal}
        />
      )}

      {MEALS.map((meal) => {
        const entries = dayEntries.filter((e) => mealOf(e) === meal);
        const kcal = entries.reduce((sum, e) => sum + e.kcal, 0);
        const last = entries.length === 0 ? previous[meal] : null;
        const saved = templates.find((t) => t.name === describeDishes(entries.map((e) => e.name)));
        return (
          <Card key={meal} style={styles.meal}>
            <Row style={styles.mealHeader}>
              <View style={styles.mealIcon}>
                <Ionicons name={MEAL_ICONS[meal]} size={20} color={colors.accent} />
              </View>
              <View style={styles.flex}>
                <Text variant="heading">{MEAL_LABELS[meal]}</Text>
                <Text variant="muted">
                  {entries.length > 0
                    ? `${formatKcal(kcal)} ${tr('ккал', 'kcal')}`
                    : tr('Ще нічого', 'Nothing yet')}
                </Text>
              </View>
              {entries.length > 0 && shortcuts.templates && (
                <IconButton
                  icon={saved ? 'bookmark' : 'bookmark-outline'}
                  color={saved ? colors.accent : colors.textSecondary}
                  onPress={() => (saved ? unsaveTemplate(saved.id) : saveTemplate(entries))}
                />
              )}
              <Button
                title={tr('Додати', 'Add')}
                icon="add"
                variant="primary"
                small
                onPress={() =>
                  router.push({ pathname: '/add-food', params: { meal, day: String(day) } })
                }
              />
            </Row>
            {daysAgo === 0 && MAIN_MEALS.includes(meal) && (
              <MealAdvice
                meal={meal}
                day={day}
                stored={mealAdvice[meal]}
                signature={reviewState.signature}
              />
            )}
            {last && (
              <RepeatRow
                label={sameMealLabel(last.day, day)}
                entries={last.entries}
                onPress={() => repeat(meal, last.entries)}
              />
            )}
            {entries.map((e) => {
              const time = timeFormatter.format(new Date(e.eatenAt));
              return (
                <SwipeToDelete
                  key={e.id}
                  onDelete={(close) => remove(e.id, `${time} · ${e.name}`, close)}>
                  <View style={styles.entry}>
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
                      <Text variant="heading">
                        {formatKcal(e.kcal)} {tr('ккал', 'kcal')}
                      </Text>
                    </Row>
                    <Text variant="caption">
                      {tr('Б', 'P')} {formatGrams(e.proteinG)} · {tr('Ж', 'F')}{' '}
                      {formatGrams(e.fatG)} · {tr('В', 'C')} {formatGrams(e.carbsG)} {tr('г', 'g')}
                    </Text>
                  </View>
                </SwipeToDelete>
              );
            })}
          </Card>
        );
      })}

      <Card>
        <Text variant="caption">{tr('Останні 7 днів', 'Last 7 days')}</Text>
        <View style={styles.chart}>
          {days.map((d) => (
            <Pressable
              key={d.dayStart}
              style={styles.barColumn}
              onPress={() => setDaysAgo(Math.round((today - d.dayStart) / 86_400_000))}>
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
              <Text variant="caption" style={d.dayStart === day && styles.today}>
                {WEEKDAY_SHORT[weekdayIndex(d.dayStart)]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
      {dialog.element}
    </Screen>
  );
}

/** "Як учора", "Як у середу" or "Як 3 жовт." for the day a meal is repeated from. */
function sameMealLabel(from: number, day: number) {
  const daysBack = Math.round((day - from) / 86_400_000);
  if (daysBack === 1) return tr('Як учора', 'Same as yesterday');
  if (daysBack < 7) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(from));
    return tr(`Як ${weekdayAccusative(weekday)}`, `Same as ${weekday}`);
  }
  return tr(`Як ${formatShortDate(from)}`, `Same as ${formatShortDate(from)}`);
}

/** "у понеділок", "у середу", "у п’ятницю": the weekday after "як". */
const weekdayAccusative = (weekday: string) =>
  `у ${weekday.toLocaleLowerCase('uk-UA').replace(/а$/, 'у').replace(/я$/, 'ю')}`;

/** One tap logs the dishes of this meal's last time again. */
function RepeatRow({
  label,
  entries,
  onPress,
}: {
  label: string;
  entries: FoodEntry[];
  onPress: () => void;
}) {
  const kcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.repeat, pressed && styles.pressed]}>
      <Ionicons name="repeat" size={18} color={colors.accent} />
      <View style={styles.flex}>
        <Text variant="body" style={styles.repeatLabel}>
          {label}
        </Text>
        <Text variant="muted" numberOfLines={1}>
          {describeDishes(entries.map((e) => e.name))}
        </Text>
      </View>
      <Text variant="body" style={styles.repeatKcal}>
        +{formatKcal(kcal)} {tr('ккал', 'kcal')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spaceBetween: { justifyContent: 'space-between' },
  dayNav: { gap: spacing.md, justifyContent: 'space-between' },
  dayTitle: { flex: 1, alignItems: 'center' },
  meal: { gap: 0, paddingVertical: spacing.sm },
  mealHeader: { gap: spacing.md, paddingVertical: spacing.sm },
  mealIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Rows sit inside the meal card; the solid fill hides the trash while swiping.
  entry: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.glassBorder,
    backgroundColor: colors.surface,
  },
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
  pressed: { opacity: 0.6 },
  repeat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.glassBorder,
  },
  repeatLabel: { fontWeight: '700' },
  repeatKcal: { color: colors.accent, fontWeight: '700' },
});
