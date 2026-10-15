import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/floating-tab-bar';
import { Backdrop } from '@/components/glass';
import { ExercisesView } from '@/components/training/exercises-view';
import { HistoryView } from '@/components/training/history-view';
import { OverviewView } from '@/components/training/overview-view';
import { ProgramsView } from '@/components/training/programs-view';
import { CircleButton, ScreenHeader } from '@/components/ui';
import { createProgram } from '@/db/programs';
import { colors, fontSize, radius, spacing } from '@/theme';

const SECTIONS = ['today', 'programs', 'exercises', 'history'] as const;
export type TrainingSection = (typeof SECTIONS)[number];

const LABELS: Record<TrainingSection, string> = {
  today: 'Сьогодні',
  programs: 'Програми',
  exercises: 'Вправи',
  history: 'Історія',
};

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

  // A new program starts with a placeholder name; the editor opens with it selected to retype.
  const newProgram = async () => {
    const id = await createProgram('Нова програма');
    router.push({ pathname: '/program/[id]', params: { id, isNew: '1' } });
  };

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
          (section === 'exercises' || section === 'programs') && (
            <CircleButton
              icon="add"
              background={colors.accent}
              color={colors.accentText}
              onPress={section === 'exercises' ? () => router.push('/exercise/edit') : newProgram}
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
        {section === 'today' && <OverviewView bottomSpace={tabBarSpace} onSection={select} />}
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
