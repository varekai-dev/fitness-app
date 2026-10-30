import { plural, t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { GrowBar } from '@/components/motion';
import { Badge, Card, Loading, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { readSeenLevels, writeSeenLevels } from '@/db/achievements';
import { useAchievements } from '@/hooks/use-achievements';
import {
  ACHIEVEMENT_GROUPS,
  achievementTotals,
  GROUP_INFO,
  type AchievementProgress,
} from '@/lib/achievements';
import { formatShortDate } from '@/lib/labels';
import { colors, fontSize, radius, spacing } from '@/theme';

const formatValue = (p: AchievementProgress, value: number) =>
  p.achievement.format?.(value) ?? String(Math.floor(value));

/**
 * Levels earned from the whole history: workouts, streaks, records, food and
 * water logged, weigh-ins. Levels reached since the last visit are marked new.
 */
export default function AchievementsScreen() {
  const list = useAchievements();
  // What was seen before this visit, so new levels stay marked until the screen closes.
  const [seen] = useState(readSeenLevels);
  const [open, setOpen] = useState<AchievementProgress | null>(null);
  // Keeps the sheet's content while it slides away.
  const [shown, setShown] = useState<AchievementProgress | null>(null);
  if (open !== null && open !== shown) setShown(open);

  useEffect(() => {
    if (!list) return;
    const levels = Object.fromEntries(list.map((p) => [p.achievement.id, p.level]));
    // Saving changes the database, which reloads the list: write only what differs.
    if (JSON.stringify(levels) !== JSON.stringify(readSeenLevels())) writeSeenLevels(levels);
  }, [list]);

  if (!list) return <Loading />;
  const totals = achievementTotals(list);

  return (
    <Screen title={t`Досягнення`}>
      <Card style={styles.summary}>
        <View style={styles.glow} />
        <Row style={styles.summaryRow}>
          <Ionicons name="medal" size={36} color={colors.accent} />
          <View style={styles.flex}>
            <RNText style={styles.summaryValue}>
              {totals.unlocked}
              <RNText style={styles.summaryOf}> / {totals.total}</RNText>
            </RNText>
            <Text variant="muted">
              {plural(totals.unlocked, { one: 'рівень відкрито', few: 'рівні відкрито', many: 'рівнів відкрито', other: 'рівні відкрито' })}
            </Text>
          </View>
        </Row>
        <GrowBar
          progress={totals.total ? totals.unlocked / totals.total : 0}
          color={colors.accent}
          style={styles.track}
        />
      </Card>

      {ACHIEVEMENT_GROUPS.map((group) => {
        const items = list.filter((p) => p.achievement.group === group);
        if (items.length === 0) return null;
        return (
          <View key={group} style={styles.group}>
            <SectionHeader title={GROUP_INFO[group].title} />
            {items.map((p) => (
              <AchievementCard
                key={p.achievement.id}
                progress={p}
                isNew={p.level > (seen[p.achievement.id] ?? 0)}
                onPress={() => setOpen(p)}
              />
            ))}
          </View>
        );
      })}

      <BottomSheet visible={open !== null} onClose={() => setOpen(null)}>
        {shown && <LevelsSheet progress={shown} />}
      </BottomSheet>
    </Screen>
  );
}

function AchievementIcon({ progress, size }: { progress: AchievementProgress; size: number }) {
  const reached = progress.level > 0;
  return (
    <View
      style={[
        styles.icon,
        { width: size, height: size, borderRadius: size / 2 },
        reached && styles.iconReached,
      ]}>
      <Ionicons
        name={progress.achievement.icon}
        size={size * 0.5}
        color={reached ? colors.accentText : colors.textMuted}
      />
    </View>
  );
}

function AchievementCard({
  progress: p,
  isNew,
  onPress,
}: {
  progress: AchievementProgress;
  isNew: boolean;
  onPress: () => void;
}) {
  const { levels } = p.achievement;
  const next = levels[p.level];
  const prev = levels[p.level - 1] ?? 0;
  return (
    <Card onPress={onPress}>
      <Row style={styles.cardRow}>
        <AchievementIcon progress={p} size={48} />
        <View style={styles.flex}>
          <Row style={styles.titleRow}>
            <Text variant="heading" numberOfLines={1} style={styles.shrink}>
              {p.achievement.title}
            </Text>
            {isNew && <Badge label={t`НОВЕ`} />}
          </Row>
          <Text variant="muted" numberOfLines={2}>
            {next === undefined
              ? t`Усі рівні відкрито`
              : p.achievement.goal(next)}
          </Text>
          <Row style={styles.pips}>
            {levels.map((target, i) => (
              <View key={target} style={[styles.pip, i < p.level && styles.pipReached]} />
            ))}
            {next !== undefined && (
              <RNText style={styles.count}>
                {formatValue(p, p.value)} / {formatValue(p, next)}
              </RNText>
            )}
          </Row>
          {next !== undefined && (
            <GrowBar
              // From the last level reached, so a fresh level doesn't start half full.
              progress={(p.value - prev) / (next - prev)}
              color={colors.accent}
              style={styles.track}
            />
          )}
        </View>
      </Row>
    </Card>
  );
}

function LevelsSheet({ progress: p }: { progress: AchievementProgress }) {
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHead}>
        <AchievementIcon progress={p} size={64} />
        <Text variant="title">{p.achievement.title}</Text>
        <Text variant="muted">
          {t`Рівень`} {p.level} / {p.achievement.levels.length}
        </Text>
      </View>
      {p.achievement.levels.map((target, i) => {
        const at = p.unlockedAt[i];
        return (
          <Row key={target} style={styles.level}>
            <Ionicons
              name={at !== null ? 'checkmark-circle' : 'lock-closed'}
              size={20}
              color={at !== null ? colors.accent : colors.textMuted}
            />
            <Text variant={at !== null ? 'body' : 'secondary'} style={styles.flex}>
              {p.achievement.goal(target)}
            </Text>
            <Text variant="muted">
              {at !== null
                ? formatShortDate(at)
                : `${Math.min(100, Math.floor((p.value / target) * 100))}%`}
            </Text>
          </Row>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  summary: { gap: spacing.md, overflow: 'hidden' },
  glow: {
    position: 'absolute',
    right: -60,
    top: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accentSoft,
    opacity: 0.6,
  },
  summaryRow: { gap: spacing.md, alignItems: 'center' },
  summaryValue: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  summaryOf: { color: colors.textSecondary, fontSize: fontSize.lg, fontWeight: '700' },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  group: { gap: spacing.md },
  cardRow: { gap: spacing.md, alignItems: 'center' },
  titleRow: { gap: spacing.sm, alignItems: 'center' },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  iconReached: { backgroundColor: colors.accent },
  pips: { gap: 4, alignItems: 'center', marginTop: spacing.xs, marginBottom: 2 },
  pip: { width: 14, height: 4, borderRadius: 2, backgroundColor: colors.surfaceRaised },
  pipReached: { backgroundColor: colors.accent },
  count: {
    marginLeft: 'auto',
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  sheet: { gap: spacing.md, paddingHorizontal: spacing.lg },
  sheetHead: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  level: { gap: spacing.md, alignItems: 'center' },
});
