import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
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
import { deleteWater, loadWater } from '@/db/water';
import { useDbQuery } from '@/hooks/use-db-query';
import { useToday } from '@/hooks/use-today';
import { locale, tr } from '@/lib/i18n';
import { WEEKDAY_SHORT, weekdayIndex } from '@/lib/labels';
import { formatLiters, formatMl, GLASS_PRESETS, glassForAmount } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
const CHART_HEIGHT = 120;

export default function WaterScreen() {
  const tabBarSpace = useTabBarSpace();
  const day = useToday();
  const { data } = useDbQuery(() => loadWater(), [day]);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const { goal, todayEntries, todayMl, days, today } = data;
  const percent = goal > 0 ? Math.round((todayMl / goal) * 100) : 0;

  const remove = (id: number, label: string, close: () => void) =>
    dialog.show({
      title: tr('Видалити запис?', 'Delete entry?'),
      message: label,
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel', onPress: close },
        { text: tr('Видалити', 'Delete'), style: 'destructive', onPress: () => deleteWater(id) },
      ],
    });

  const chartMax = Math.max(goal, ...days.map((d) => d.totalMl));

  return (
    <Screen
      title={tr('Вода', 'Water')}
      mode="root"
      bottomSpace={tabBarSpace}
      headerRight={
        <CircleButton icon="settings-outline" onPress={() => router.push('/settings')} />
      }>
      <Card style={styles.hero} onPress={() => router.push('/settings/water')}>
        <Text style={styles.amount}>
          {formatMl(todayMl)}
          <Text style={styles.unit}> {tr('мл', 'ml')}</Text>
        </Text>
        <Text variant="muted">
          {todayMl >= goal
            ? tr('Ціль на сьогодні виконано!', 'Today’s goal reached!')
            : tr(`${percent}% денної норми`, `${percent}% of daily goal`)}
        </Text>
        <Row style={styles.heroBody}>
          <View style={styles.heroSide} />
          <WaterBottle progress={goal > 0 ? todayMl / goal : 0} height={300} />
          <View style={[styles.heroSide, styles.heroGoal]}>
            <Text variant="caption" style={styles.goalLabel}>
              {tr('ЦІЛЬ', 'GOAL')}
            </Text>
            <Text variant="heading">{formatMl(goal)}</Text>
          </View>
        </Row>
      </Card>

      <SectionHeader title={tr('Додати', 'Add')} />
      <View style={styles.glasses}>
        {GLASS_PRESETS.map((g) => (
          <View key={g.ml} style={styles.glassCell}>
            <GlassButton glass={g} onPress={() => drinkWater(g.ml, todayMl, goal)} />
          </View>
        ))}
      </View>

      <Card>
        <Text variant="caption">{tr('Останні 7 днів', 'Last 7 days')}</Text>
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

      <SectionHeader title={tr('Сьогодні', 'Today')} />
      {todayEntries.length === 0 ? (
        <EmptyState
          icon="water-outline"
          title={tr('Ще нічого не випито', 'Nothing drunk yet')}
          hint={tr('Обери склянку вище.', 'Pick a glass above.')}
        />
      ) : (
        [...todayEntries].reverse().map((e) => {
          const glass = glassForAmount(e.amountMl);
          const time = timeFormatter.format(new Date(e.drankAt));
          return (
            <SwipeToDelete
              key={e.id}
              onDelete={(close) =>
                remove(e.id, `${time} · ${formatMl(e.amountMl)} ${tr('мл', 'ml')}`, close)
              }>
              <Card>
                <Row style={styles.spaceBetween}>
                  <Row>
                    <View style={styles.entryIcon}>
                      <MaterialCommunityIcons name={glass.icon} size={20} color={colors.accent} />
                    </View>
                    <Text variant="body">{glass.label}</Text>
                  </Row>
                  <Row>
                    <Text variant="heading">
                      {formatMl(e.amountMl)} {tr('мл', 'ml')}
                    </Text>
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
