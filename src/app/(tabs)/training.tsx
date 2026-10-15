import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/floating-tab-bar';
import { Backdrop } from '@/components/glass';
import { ExercisesView } from '@/components/training/exercises-view';
import { HistoryView } from '@/components/training/history-view';
import { ProgramsView } from '@/components/training/programs-view';
import { CircleButton, ScreenHeader } from '@/components/ui';
import { colors, fontSize, radius, spacing } from '@/theme';

const SECTIONS = ['programs', 'exercises', 'history'] as const;
export type TrainingSection = (typeof SECTIONS)[number];

const LABELS: Record<TrainingSection, string> = {
  programs: 'Програми',
  exercises: 'Вправи',
  history: 'Історія',
};

const isSection = (v: unknown): v is TrainingSection => SECTIONS.includes(v as TrainingSection);

/**
 * Everything about workouts in one tab: programs, the exercise library and the
 * history with its activity calendar. `?view=` picks the section, so links from
 * other screens can open the right one.
 */
export default function TrainingScreen() {
  const tabBarSpace = useTabBarSpace();
  const { view } = useLocalSearchParams<{ view?: string }>();
  // The URL is the single source of truth, so links and the switcher stay in sync.
  const section: TrainingSection = isSection(view) ? view : 'programs';

  const select = (next: TrainingSection) => {
    if (next === section) return;
    Haptics.selectionAsync();
    router.setParams({ view: next });
  };

  return (
    <View style={styles.root}>
      <Backdrop />
      <ScreenHeader
        title="Тренування"
        mode="root"
        right={
          section === 'exercises' && (
            <CircleButton
              icon="add"
              background={colors.accent}
              color={colors.accentText}
              onPress={() => router.push('/exercise/edit')}
            />
          )
        }
      />
      <View style={styles.segments}>
        {SECTIONS.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: s === section }}
            onPress={() => select(s)}
            style={[styles.segment, s === section && styles.segmentActive]}>
            <Text style={[styles.segmentText, s === section && styles.segmentTextActive]}>
              {LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.body}>
        {section === 'programs' && <ProgramsView bottomSpace={tabBarSpace} />}
        {section === 'exercises' && <ExercisesView bottomSpace={tabBarSpace} />}
        {section === 'history' && <HistoryView bottomSpace={tabBarSpace} />}
      </View>
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
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700' },
  segmentTextActive: { color: colors.accentText },
  body: { flex: 1 },
});
