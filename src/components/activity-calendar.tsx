import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Card, IconButton, Row, Text } from '@/components/ui';
import { startOfWeek, WEEKDAY_SHORT, weekdayIndex } from '@/lib/labels';
import { colors, radius, spacing } from '@/theme';

const MONTHS = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * "This week" card with a dot per trained day. Tapping the header expands it
 * into a month calendar that can be paged back through earlier months.
 */
export function ActivityCalendar({ workoutDates, now }: { workoutDates: number[]; now: number }) {
  const [expanded, setExpanded] = useState(false);
  // 0 = current month, -1 = previous, and so on.
  const [monthOffset, setMonthOffset] = useState(0);

  const trained = new Set(workoutDates.map((ms) => dayKey(new Date(ms))));
  const weekStart = startOfWeek(now);
  const trainedThisWeek = new Set(
    workoutDates.filter((ms) => ms >= weekStart).map((ms) => weekdayIndex(ms)),
  );
  const today = weekdayIndex(now);

  const toggle = () => {
    setExpanded((e) => !e);
    setMonthOffset(0);
  };

  return (
    <Card>
      <Pressable onPress={toggle} hitSlop={8}>
        <Row style={styles.spaceBetween}>
          <Text variant="heading">{expanded ? 'Активність' : 'Цей тиждень'}</Text>
          <Row style={styles.streak}>
            <Text variant="caption" style={styles.accent}>
              {trainedThisWeek.size} дн.
            </Text>
            <Ionicons name="flame" size={14} color={colors.accent} />
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textMuted}
              style={styles.chevron}
            />
          </Row>
        </Row>
      </Pressable>

      {expanded ? (
        <Animated.View entering={FadeIn} exiting={FadeOut}>
          <Month
            now={now}
            offset={monthOffset}
            trained={trained}
            onPrev={() => setMonthOffset((o) => o - 1)}
            onNext={() => setMonthOffset((o) => Math.min(0, o + 1))}
          />
        </Animated.View>
      ) : (
        <Row style={styles.week}>
          {WEEKDAY_SHORT.map((label, i) => {
            const done = trainedThisWeek.has(i);
            return (
              <View key={label} style={styles.weekDay}>
                <Text variant="muted" style={i === today && styles.today}>
                  {label}
                </Text>
                <View
                  style={[
                    styles.dot,
                    done && styles.dotDone,
                    i === today && !done && styles.dotToday,
                  ]}>
                  {done && <Ionicons name="checkmark" size={14} color={colors.accentText} />}
                </View>
              </View>
            );
          })}
        </Row>
      )}
    </Card>
  );
}

function Month({
  now,
  offset,
  trained,
  onPrev,
  onNext,
}: {
  now: number;
  offset: number;
  trained: Set<string>;
  onPrev: () => void;
  onNext: () => void;
}) {
  const ref = new Date(now);
  const first = new Date(ref.getFullYear(), ref.getMonth() + offset, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const todayKey = dayKey(ref);
  const leading = weekdayIndex(first.getTime());
  const cells: (Date | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1),
    ),
  ];
  const count = cells.filter((d) => d && trained.has(dayKey(d))).length;

  return (
    <View style={styles.month}>
      <Row style={styles.spaceBetween}>
        <IconButton icon="chevron-back" onPress={onPrev} />
        <View style={styles.monthTitle}>
          <Text variant="body">
            {MONTHS[first.getMonth()]} {first.getFullYear()}
          </Text>
          <Text variant="muted">Тренувальних днів: {count}</Text>
        </View>
        <IconButton icon="chevron-forward" onPress={onNext} disabled={offset === 0} />
      </Row>
      <View style={styles.grid}>
        {WEEKDAY_SHORT.map((label) => (
          <View key={label} style={styles.cell}>
            <Text variant="muted">{label}</Text>
          </View>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`blank-${i}`} style={styles.cell} />;
          const key = dayKey(d);
          const done = trained.has(key);
          const isToday = key === todayKey;
          const future = d.getTime() > now;
          return (
            <View key={key} style={styles.cell}>
              <View
                style={[styles.day, done && styles.dotDone, isToday && !done && styles.dotToday]}>
                <Text
                  variant="caption"
                  style={[
                    styles.dayText,
                    done && styles.dayTextDone,
                    future && styles.dayTextFuture,
                  ]}>
                  {d.getDate()}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spaceBetween: { justifyContent: 'space-between' },
  streak: { gap: 2 },
  accent: { color: colors.accent },
  chevron: { marginLeft: spacing.xs },
  week: { justifyContent: 'space-between', marginTop: spacing.sm },
  weekDay: { alignItems: 'center', gap: spacing.sm },
  today: { color: colors.text, fontWeight: '700' },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.accent },
  dotToday: { borderWidth: 1.5, borderColor: colors.accent },
  month: { gap: spacing.sm, marginTop: spacing.xs },
  monthTitle: { alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  day: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { color: colors.text, fontWeight: '600' },
  dayTextDone: { color: colors.accentText },
  dayTextFuture: { color: colors.textMuted },
});
