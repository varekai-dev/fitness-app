import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { GoalPulse, GrowBar, GrowColumn, ListRow } from '@/components/motion';
import { TAB_BAR_FAB_SPACE, TabBarFab, useTabBarSpace } from '@/components/floating-tab-bar';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import {
  Card,
  CircleButton,
  EmptyState,
  Loading,
  Row,
  Screen,
  SCREEN_GAP,
  SectionHeader,
  Text,
} from '@/components/ui';
import { WaterBottle } from '@/components/water-bottle';
import { drinkWater, GlassButton } from '@/components/water-card';
import { type PourRequest, WaterPourModal } from '@/components/water-pour-modal';
import { deleteWater, loadWater, updateWater } from '@/db/water';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { useDbQuery } from '@/hooks/use-db-query';
import { useNow } from '@/hooks/use-now';
import { useToday } from '@/hooks/use-today';
import { locale, tr } from '@/lib/i18n';
import { WEEKDAY_SHORT, weekdayIndex } from '@/lib/labels';
import { paceShare } from '@/lib/reminders';
import { formatVolume, formatVolumeCompact, VOLUME_UNIT } from '@/lib/units';
import { GLASS_PRESETS, glassForAmount, glassToHold } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
const CHART_HEIGHT = 120;
/** The floating plus opens the pour modal with this glass. */
const QUICK_ML = 300;

export default function WaterScreen() {
  const tabBarSpace = useTabBarSpace();
  const day = useToday();
  const now = useNow();
  const { data } = useDbQuery(() => loadWater(), [day]);
  const dialog = useDialog();
  const [pouring, setPouring] = useState<(PourRequest & { editId?: number }) | null>(null);

  if (!data) return <Loading />;
  const { goal, todayEntries, todayMl, days, today, dayWindow } = data;

  const remove = (
    id: number,
    label: string,
    close: () => void,
    collapse: (then: () => void) => void,
  ) =>
    dialog.show({
      title: tr('Видалити запис?', 'Delete entry?'),
      message: label,
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel', onPress: close },
        {
          text: tr('Видалити', 'Delete'),
          style: 'destructive',
          onPress: () => collapse(() => deleteWater(id)),
        },
      ],
    });

  const chartMax = Math.max(goal, ...days.map((d) => d.totalMl));

  return (
    <View style={styles.root}>
      <Screen
        title={tr('Вода', 'Water')}
        mode="root"
        bottomSpace={tabBarSpace + TAB_BAR_FAB_SPACE}
        headerRight={
          <CircleButton icon="settings-outline" onPress={() => router.push('/settings')} />
        }>
        <Card onPress={() => router.push('/settings/water')}>
          <Row style={styles.hero}>
            <GoalPulse reached={goal > 0 && todayMl >= goal}>
              <WaterBottle
                progress={goal > 0 ? todayMl / goal : 0}
                pace={paceShare(dayWindow, now)}
                height={170}
              />
            </GoalPulse>
            <WaterSummary todayMl={todayMl} goal={goal} />
          </Row>
        </Card>

        <SectionHeader title={tr('Додати', 'Add')} />
        <View style={styles.glasses}>
          {GLASS_PRESETS.map((g) => (
            <View key={g.ml} style={styles.glassCell}>
              <GlassButton glass={g} onPress={() => setPouring({ glass: g })} />
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
                    {d.totalMl > 0 ? formatVolumeCompact(d.totalMl) : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.goalLine, { bottom: (goal / chartMax) * CHART_HEIGHT }]} />
                    <GrowColumn
                      height={Math.max((d.totalMl / chartMax) * CHART_HEIGHT, d.totalMl ? 4 : 0)}
                      style={[styles.bar, !reached && styles.barPartial]}
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
              <ListRow key={e.id} gap={SCREEN_GAP}>
                {(collapse) => (
                  <SwipeToDelete
                    onDelete={(close) =>
                      remove(
                        e.id,
                        `${time} · ${formatVolume(e.amountMl)} ${VOLUME_UNIT}`,
                        close,
                        collapse,
                      )
                    }>
                    <Card
                      onPress={() =>
                        setPouring({
                          glass: glassToHold(e.amountMl),
                          editMl: e.amountMl,
                          editId: e.id,
                        })
                      }>
                      <Row style={styles.spaceBetween}>
                        <Row>
                          <View style={styles.entryIcon}>
                            <MaterialCommunityIcons
                              name={glass.icon}
                              size={20}
                              color={colors.accent}
                            />
                          </View>
                          <Text variant="body">{glass.label}</Text>
                        </Row>
                        <Row>
                          <Text variant="heading">
                            {formatVolume(e.amountMl)} {VOLUME_UNIT}
                          </Text>
                          <Text variant="muted">{time}</Text>
                        </Row>
                      </Row>
                    </Card>
                  </SwipeToDelete>
                )}
              </ListRow>
            );
          })
        )}
        <WaterPourModal
          pour={pouring}
          onClose={() => setPouring(null)}
          onAdd={(ml) => {
            setPouring(null);
            if (pouring?.editId != null) updateWater(pouring.editId, ml);
            else drinkWater(ml);
          }}
        />
        {dialog.element}
      </Screen>
      <TabBarFab
        tabCount={4}
        label={tr(
          `Додати склянку ${formatVolume(QUICK_ML)} ${VOLUME_UNIT}`,
          `Add a ${formatVolume(QUICK_ML)} ${VOLUME_UNIT} glass`,
        )}
        onPress={() => setPouring({ glass: glassToHold(QUICK_ML) })}
      />
    </View>
  );
}

/** Today's total, percent and what's left, counting up when a drink is added. */
function WaterSummary({ todayMl, goal }: { todayMl: number; goal: number }) {
  const ml = Math.round(useAnimatedNumber(todayMl));
  const percent = goal > 0 ? Math.round((ml / goal) * 100) : 0;

  return (
    <View style={styles.heroInfo}>
      <Text style={styles.amount}>
        {formatVolume(ml)}
        <Text style={styles.unit}> {VOLUME_UNIT}</Text>
      </Text>
      <Text variant="muted">
        {todayMl >= goal && ml >= goal
          ? tr('Ціль на сьогодні виконано!', 'Today’s goal reached!')
          : tr(`${percent}% денної норми`, `${percent}% of daily goal`)}
      </Text>
      <GrowBar
        progress={goal > 0 ? todayMl / goal : 0}
        color={colors.accent}
        style={styles.progressTrack}
      />
      <Row style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Text variant="caption" style={styles.goalLabel} numberOfLines={1}>
            {tr('ЦІЛЬ', 'GOAL')}
          </Text>
          <Text variant="heading">
            {formatVolume(goal)} {VOLUME_UNIT}
          </Text>
        </View>
        <View style={styles.heroStat}>
          <Text variant="caption" style={styles.goalLabel} numberOfLines={1}>
            {tr('ЗАЛИШИЛОСЬ', 'LEFT')}
          </Text>
          <Text variant="heading" style={styles.tabular}>
            {formatVolume(Math.max(goal - ml, 0))} {VOLUME_UNIT}
          </Text>
        </View>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { gap: spacing.lg },
  heroInfo: { flex: 1, gap: spacing.xs },
  amount: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  tabular: { fontVariant: ['tabular-nums'] },
  unit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  progressTrack: {
    height: 6,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  heroStats: { marginTop: spacing.md, alignItems: 'flex-start', gap: spacing.md },
  heroStat: { flexGrow: 1, gap: 2 },
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
