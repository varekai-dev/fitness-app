import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { useTabBarSpace } from '@/components/floating-tab-bar';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import {
  Card,
  CircleButton,
  EmptyState,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { WaterBottle } from '@/components/water-bottle';
import { drinkWater, GlassButton } from '@/components/water-card';
import { deleteWater, loadWater, setWaterGoal } from '@/db/water';
import { useDbQuery } from '@/hooks/use-db-query';
import { WEEKDAY_SHORT, weekdayIndex } from '@/lib/labels';
import {
  formatLiters,
  formatMl,
  GLASS_PRESETS,
  glassForAmount,
  MAX_WATER_GOAL_ML,
  MIN_WATER_GOAL_ML,
  WATER_GOAL_STEP_ML,
} from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

const timeFormatter = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const CHART_HEIGHT = 120;

export default function WaterScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(() => loadWater());
  const dialog = useDialog();

  if (!data) return <Loading />;
  const { goal, todayEntries, todayMl, days, today } = data;
  const percent = goal > 0 ? Math.round((todayMl / goal) * 100) : 0;

  const changeGoal = (delta: number) => {
    const next = Math.min(Math.max(goal + delta, MIN_WATER_GOAL_ML), MAX_WATER_GOAL_ML);
    if (next === goal) return;
    Haptics.selectionAsync();
    setWaterGoal(next);
  };

  const remove = (id: number, label: string, close: () => void) =>
    dialog.show({
      title: 'Видалити запис?',
      message: label,
      buttons: [
        { text: 'Скасувати', style: 'cancel', onPress: close },
        { text: 'Видалити', style: 'destructive', onPress: () => deleteWater(id) },
      ],
    });

  const chartMax = Math.max(goal, ...days.map((d) => d.totalMl));

  return (
    <Screen title="Вода" mode="root" bottomSpace={tabBarSpace}>
      <Card style={styles.hero}>
        <Text style={styles.amount}>
          {formatMl(todayMl)}
          <Text style={styles.unit}> мл</Text>
        </Text>
        <Text variant="muted">
          {todayMl >= goal ? 'Ціль на сьогодні виконано!' : `${percent}% денної норми`}
        </Text>
        <Row style={styles.heroBody}>
          <View style={styles.heroSide} />
          <WaterBottle progress={goal > 0 ? todayMl / goal : 0} height={300} />
          <View style={[styles.heroSide, styles.heroGoal]}>
            <Text variant="caption" style={styles.goalLabel}>
              ЦІЛЬ
            </Text>
            <Text variant="heading">{formatMl(goal)}</Text>
          </View>
        </Row>
      </Card>

      <SectionHeader title="Додати" />
      <View style={styles.glasses}>
        {GLASS_PRESETS.map((g) => (
          <View key={g.ml} style={styles.glassCell}>
            <GlassButton glass={g} onPress={() => drinkWater(g.ml, todayMl, goal)} />
          </View>
        ))}
      </View>

      <Card>
        <Row style={styles.spaceBetween}>
          <View>
            <Text variant="heading">Денна ціль</Text>
            <Text variant="muted">Крок {WATER_GOAL_STEP_ML} мл</Text>
          </View>
          <Row style={styles.stepper}>
            <CircleButton
              icon="remove"
              size={36}
              disabled={goal <= MIN_WATER_GOAL_ML}
              onPress={() => changeGoal(-WATER_GOAL_STEP_ML)}
            />
            <Text variant="heading" style={styles.goalValue}>
              {formatMl(goal)} мл
            </Text>
            <CircleButton
              icon="add"
              size={36}
              disabled={goal >= MAX_WATER_GOAL_ML}
              onPress={() => changeGoal(WATER_GOAL_STEP_ML)}
            />
          </Row>
        </Row>
      </Card>

      <Card>
        <Text variant="caption">Останні 7 днів</Text>
        <View style={styles.chart}>
          {days.map((d) => {
            const isToday = d.dayStart === today;
            const reached = d.totalMl >= goal;
            return (
              <View key={d.dayStart} style={styles.barColumn}>
                <Text variant="muted" style={styles.barValue} numberOfLines={1}>
                  {d.totalMl > 0 ? formatLiters(d.totalMl) : ''}
                </Text>
                <View style={styles.barTrack}>
                  <View style={[styles.goalLine, { bottom: (goal / chartMax) * CHART_HEIGHT }]} />
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max((d.totalMl / chartMax) * CHART_HEIGHT, d.totalMl ? 4 : 0),
                      },
                      !reached && styles.barPartial,
                    ]}
                  />
                </View>
                <Text variant="caption" style={isToday && styles.today}>
                  {WEEKDAY_SHORT[weekdayIndex(d.dayStart)]}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <SectionHeader title="Сьогодні" />
      {todayEntries.length === 0 ? (
        <EmptyState icon="water-outline" title="Ще нічого не випито" hint="Обери склянку вище." />
      ) : (
        [...todayEntries].reverse().map((e) => {
          const glass = glassForAmount(e.amountMl);
          const time = timeFormatter.format(new Date(e.drankAt));
          return (
            <SwipeToDelete
              key={e.id}
              onDelete={(close) => remove(e.id, `${time} · ${formatMl(e.amountMl)} мл`, close)}>
              <Card>
                <Row style={styles.spaceBetween}>
                  <Row>
                    <View style={styles.entryIcon}>
                      <MaterialCommunityIcons name={glass.icon} size={20} color={colors.accent} />
                    </View>
                    <Text variant="body">{glass.label}</Text>
                  </Row>
                  <Row>
                    <Text variant="heading">{formatMl(e.amountMl)} мл</Text>
                    <Text variant="muted">{time}</Text>
                  </Row>
                </Row>
              </Card>
            </SwipeToDelete>
          );
        })
      )}
      {dialog.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: spacing.xl },
  amount: { color: colors.text, fontSize: fontSize.hero, fontWeight: '800', letterSpacing: -1 },
  unit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  heroBody: { alignItems: 'flex-end', marginTop: spacing.md },
  heroSide: { flex: 1 },
  heroGoal: { paddingLeft: spacing.md, paddingBottom: spacing.sm },
  goalLabel: { letterSpacing: 1 },
  glasses: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  glassCell: { flexGrow: 1, flexBasis: '30%' },
  spaceBetween: { justifyContent: 'space-between' },
  stepper: { gap: spacing.sm },
  goalValue: { minWidth: 84, textAlign: 'center' },
  chart: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'flex-end',
  },
  // Drawn per column, so the gaps between bars make it read as a dashed line.
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
  barPartial: { backgroundColor: colors.accentSoft },
  today: { color: colors.accent, fontWeight: '700' },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
