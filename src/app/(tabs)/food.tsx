import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { useTabBarSpace } from '@/components/floating-tab-bar';
import { MacroRow } from '@/components/macro-row';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { Button, Card, CircleButton, Loading, Row, Screen, Text } from '@/components/ui';
import { deleteFoodEntry, loadFood } from '@/db/food';
import { useDbQuery } from '@/hooks/use-db-query';
import { useToday } from '@/hooks/use-today';
import { formatGrams, formatKcal } from '@/lib/food';
import { locale, tr } from '@/lib/i18n';
import { formatLongDate, WEEKDAY_SHORT, weekdayIndex } from '@/lib/labels';
import { MEAL_ICONS, MEAL_LABELS, MEALS, mealOf } from '@/lib/meals';
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
  const { goal, dayEntries, totals, days } = data;
  const left = goal - totals.kcal;

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
      <Card style={styles.hero} onPress={() => router.push('/settings/food')}>
        <Text style={styles.amount}>
          {formatKcal(totals.kcal)}
          <Text style={styles.unit}> {tr('ккал', 'kcal')}</Text>
        </Text>
        <Text variant="muted">
          {left >= 0
            ? tr(
                `ще ${formatKcal(left)} з ${formatKcal(goal)}`,
                `${formatKcal(left)} of ${formatKcal(goal)} left`,
              )
            : tr(`понад ціль на ${formatKcal(-left)}`, `${formatKcal(-left)} over goal`)}
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

      {MEALS.map((meal) => {
        const entries = dayEntries.filter((e) => mealOf(e) === meal);
        const kcal = entries.reduce((sum, e) => sum + e.kcal, 0);
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
});
