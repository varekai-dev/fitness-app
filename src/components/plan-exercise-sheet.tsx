import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MuscleIcon } from '@/components/muscle-icon';
import { YoutubePlayer, youtubeVideoId } from '@/components/youtube-player';
import { Badge, Button, Card, CircleButton, Row, Text } from '@/components/ui';
import { exerciseImageSource } from '@/lib/exercise-images';
import { defaultYoutubeUrl } from '@/lib/exercise-videos';
import { tr } from '@/lib/i18n';
import { formatTargets, MUSCLE_GROUP_LABELS } from '@/lib/labels';
import type { PlanExercise } from '@/lib/program-ai';
import { colors, spacing } from '@/theme';

/**
 * An exercise of an AI plan on the whole screen: its form video (or photo),
 * targets and technique. `notes` and `youtubeUrl` come from the library for a
 * library exercise; a new one has the AI's notes and the video it will get.
 */
export function PlanExerciseSheet({
  exercise,
  notes,
  youtubeUrl,
  onReplace,
  onClose,
}: {
  exercise: PlanExercise | null;
  notes: string | null;
  youtubeUrl: string | null;
  onReplace: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const url = exercise ? (youtubeUrl ?? defaultYoutubeUrl(exercise.name)) : null;
  // Search links can't be embedded, so they open in the browser.
  const videoId = youtubeVideoId(url);

  return (
    <Modal visible={!!exercise} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {exercise && (
          <>
            <ScrollView
              contentContainerStyle={[
                styles.content,
                { paddingBottom: insets.bottom + spacing.lg },
              ]}>
              <View style={{ paddingTop: insets.top + 60 }}>
                {videoId ? (
                  <YoutubePlayer videoId={videoId} />
                ) : (
                  <Image
                    source={exerciseImageSource(exercise.imageUri)}
                    style={styles.photo}
                    contentFit="cover"
                    transition={200}
                  />
                )}
              </View>
              <View style={styles.body}>
                <View style={styles.header}>
                  <Row style={styles.wrap}>
                    <Text variant="title" style={styles.shrink}>
                      {exercise.name}
                    </Text>
                    {exercise.exerciseId === null && <Badge label={tr('Нова', 'New')} />}
                  </Row>
                  <Text variant="secondary">{formatTargets(exercise.targets)}</Text>
                </View>
                <Card>
                  <Row style={styles.muscles}>
                    <MuscleIcon group={exercise.muscleGroup} size={56} />
                    <View>
                      <Text variant="overline">{tr('Що качає', 'Works')}</Text>
                      <Text variant="heading">{MUSCLE_GROUP_LABELS[exercise.muscleGroup]}</Text>
                    </View>
                  </Row>
                </Card>
                {notes && (
                  <Card>
                    <Text variant="overline">{tr('Техніка', 'Technique')}</Text>
                    <Text variant="secondary">{notes}</Text>
                  </Card>
                )}
                {!videoId && url && (
                  <Button
                    title={tr('Знайти техніку на YouTube', 'Find technique on YouTube')}
                    icon="logo-youtube"
                    variant="secondary"
                    onPress={() => WebBrowser.openBrowserAsync(url)}
                  />
                )}
                <Button
                  title={tr('Замінити вправу', 'Replace exercise')}
                  icon="swap-horizontal"
                  variant="secondary"
                  onPress={onReplace}
                />
              </View>
            </ScrollView>
            <View style={[styles.close, { top: insets.top + spacing.sm }]}>
              <CircleButton icon="close" onPress={onClose} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1 },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surface },
  body: { padding: spacing.lg, gap: spacing.lg },
  header: { gap: spacing.xs },
  wrap: { flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  muscles: { gap: spacing.lg },
  close: { position: 'absolute', left: spacing.lg },
});
