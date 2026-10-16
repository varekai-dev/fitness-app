import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Card, Text, type IconName } from '@/components/ui';
import type { Activity, ActivityKind, ActivitySource } from '@/db/schema';
import { tr } from '@/lib/i18n';
import { ACTIVITY_KIND_LABELS, formatShortDate } from '@/lib/labels';
import { formatDistance, formatDuration } from '@/lib/metrics';
import { DISTANCE_UNIT } from '@/lib/units';
import { colors, radius, spacing } from '@/theme';

const ICONS: Record<ActivityKind, IconName> = {
  walking: 'footsteps',
  running: 'walk',
  cycling: 'bicycle',
  hiking: 'trail-sign',
  swimming: 'water',
  strength: 'barbell',
  hiit: 'flash',
  yoga: 'body',
  other: 'fitness',
};

const SOURCE_NAMES: Record<ActivitySource, string> = {
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
};

/** A walk, run or other session imported from a health app, laid out like a workout card. */
export function ActivityCard({ activity }: { activity: Activity }) {
  const details = [
    formatDuration((activity.finishedAt - activity.startedAt) / 1000),
    activity.distanceKm ? `${formatDistance(activity.distanceKm)} ${DISTANCE_UNIT}` : null,
    activity.kcal ? `${Math.round(activity.kcal)} ${tr('ккал', 'kcal')}` : null,
  ].filter(Boolean);
  return (
    <Card style={styles.card}>
      <View style={styles.date}>
        <Text variant="heading" style={styles.dateDay}>
          {new Date(activity.startedAt).getDate()}
        </Text>
        <Text variant="muted" style={styles.dateMonth}>
          {formatShortDate(activity.startedAt).replace(/^\d+\s*/, '')}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="heading" numberOfLines={1}>
          {activity.title ?? ACTIVITY_KIND_LABELS[activity.kind]}
        </Text>
        <Text variant="muted">
          {details.join(' · ')} ·{' '}
          <Text variant="muted" style={styles.accent}>
            {SOURCE_NAMES[activity.source]}
          </Text>
        </Text>
      </View>
      <Ionicons name={ICONS[activity.kind]} size={20} color={colors.textMuted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  date: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontSize: 20, lineHeight: 22 },
  dateMonth: { fontSize: 11 },
  body: { flex: 1, gap: 2 },
  accent: { color: colors.accent },
});
