import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { TAB_BAR_FAB_SPACE, TabBarFab, useTabBarSpace } from '@/components/floating-tab-bar';
import { Backdrop } from '@/components/glass';
import { ExercisesView } from '@/components/training/exercises-view';
import { HistoryView } from '@/components/training/history-view';
import { OverviewView } from '@/components/training/overview-view';
import { ProgramsView } from '@/components/training/programs-view';
import { CircleButton, ScreenHeader } from '@/components/ui';
import { createProgram, NEW_PROGRAM_NAME } from '@/db/programs';
import { colors, fontSize, radius, spacing } from '@/theme';

const SECTIONS = ['today', 'programs', 'exercises', 'history'] as const;
export type TrainingSection = (typeof SECTIONS)[number];

const LABELS: Record<TrainingSection, string> = {
  today: t`Сьогодні`,
  programs: t`Програми`,
  exercises: t`Вправи`,
  history: t`Історія`,
};

const SEGMENT_SPRING = { damping: 18, stiffness: 220, mass: 0.7 };

const isSection = (v: unknown): v is TrainingSection => SECTIONS.includes(v as TrainingSection);

/**
 * Everything about workouts in one tab: today's workout and weekly stats,
 * programs, the exercise library and the history with its activity calendar. `?view=` picks the section, so links from
 * other screens can open the right one.
 */
export default function TrainingScreen() {
  const tabBarSpace = useTabBarSpace();
  const { view } = useLocalSearchParams<{ view?: string }>();
  // The URL is the single source of truth, so links and the switcher stay in sync.
  const section: TrainingSection = isSection(view) ? view : 'today';
  const canAdd = section === 'exercises' || section === 'programs';
  // Lists with the plus below get room to scroll clear of it.
  const listSpace = tabBarSpace + TAB_BAR_FAB_SPACE;

  // A new program starts with a placeholder name; the editor opens with it selected to retype.
  const newProgram = async () => {
    const id = await createProgram(NEW_PROGRAM_NAME);
    router.push({ pathname: '/program/[id]', params: { id, isNew: '1' } });
  };

  // The highlight slides between sections instead of jumping.
  const [segmentsWidth, setSegmentsWidth] = useState(0);
  const segment = (segmentsWidth - spacing.xs * 2) / SECTIONS.length;
  const indicatorX = useSharedValue(-1);
  useEffect(() => {
    if (segment <= 0) return;
    const x = segment * SECTIONS.indexOf(section);
    // Placed at once on the first layout, animated from then on.
    indicatorX.set(indicatorX.get() < 0 ? x : withSpring(x, SEGMENT_SPRING));
  }, [segment, section, indicatorX]);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(indicatorX.get(), 0) }],
  }));

  const select = (next: TrainingSection) => {
    if (next === section) return;
    router.setParams({ view: next });
  };

  return (
    <View style={styles.root}>
      <Backdrop />
      <ScreenHeader
        title={t`Тренування`}
        mode="root"
        right={<CircleButton icon="settings-outline" onPress={() => router.push('/settings')} />}
      />
      <View style={styles.segments} onLayout={(e) => setSegmentsWidth(e.nativeEvent.layout.width)}>
        {segment > 0 && (
          <Animated.View style={[styles.indicator, { width: segment }, indicatorStyle]} />
        )}
        {SECTIONS.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: s === section }}
            onPress={() => select(s)}
            style={styles.segment}>
            <Text style={[styles.segmentText, s === section && styles.segmentTextActive]}>
              {LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.body}>
        {section === 'today' && <OverviewView bottomSpace={tabBarSpace} onSection={select} />}
        {section === 'programs' && <ProgramsView bottomSpace={listSpace} />}
        {section === 'exercises' && <ExercisesView bottomSpace={listSpace} />}
        {section === 'history' && <HistoryView bottomSpace={tabBarSpace} />}
      </View>
      {canAdd && (
        <TabBarFab
          label={
            section === 'exercises'
              ? t`Нова вправа`
              : t`Нова програма`
          }
          onPress={section === 'exercises' ? () => router.push('/exercise/edit') : newProgram}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  segments: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  indicator: {
    position: 'absolute',
    top: spacing.xs,
    bottom: spacing.xs,
    left: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  segmentText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700' },
  segmentTextActive: { color: colors.accentText },
  body: { flex: 1 },
});
