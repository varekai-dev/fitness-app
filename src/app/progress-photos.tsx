import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDialog } from '@/components/dialog';
import { PhotoCompare, type CompareSide } from '@/components/photo-compare';
import { PoseCamera } from '@/components/pose-camera';
import {
  Badge,
  Button,
  Card,
  ChipGroup,
  CircleButton,
  EmptyState,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { listBodyWeights } from '@/db/body-weight';
import {
  addProgressPhoto,
  deleteProgressPhoto,
  listProgressPhotos,
  type ProgressPhoto,
} from '@/db/progress-photos';
import { PHOTO_POSES, type PhotoPose } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { useToday } from '@/hooks/use-today';
import { tr } from '@/lib/i18n';
import { formatDate, formatShortDate, formatWeightDelta } from '@/lib/labels';
import { formatWeight } from '@/lib/metrics';
import {
  formatSpan,
  PHOTO_EVERY_DAYS,
  photoUri,
  pickProgressPhoto,
  POSE_LABELS,
  storeProgressPhoto,
  weightNear,
} from '@/lib/progress-photos';
import { WEIGHT_UNIT } from '@/lib/units';
import { startOfDay } from '@/lib/water';
import { colors, radius, spacing } from '@/theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const COLUMNS = 3;

type Weights = Awaited<ReturnType<typeof listBodyWeights>>;

export default function ProgressPhotosScreen() {
  const { data } = useDbQuery(() => Promise.all([listProgressPhotos(), listBodyWeights()]));
  const [chosenPose, setChosenPose] = useState<PhotoPose | null>(null);
  // Photos picked for the comparison; null falls back to the first and the latest.
  const [beforeId, setBeforeId] = useState<number | null>(null);
  const [afterId, setAfterId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [adding, setAdding] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const today = useToday();
  const dialog = useDialog();

  if (!data) return <Loading />;
  const [photos, weights] = data;
  const latest = photos.at(-1);
  const pose = chosenPose ?? latest?.pose ?? 'front';
  const posed = photos.filter((p) => p.pose === pose);

  const find = (id: number | null) => (id === null ? undefined : posed.find((p) => p.id === id));
  // Older photo on the left whichever way round they were picked.
  const [before, after] = [find(beforeId) ?? posed[0], find(afterId) ?? posed.at(-1)].sort(
    (a, b) => (a?.takenAt ?? 0) - (b?.takenAt ?? 0),
  );
  const comparing = before && after && before.id !== after.id;

  const changePose = (next: PhotoPose) => {
    if (next === pose) return;
    Haptics.selectionAsync();
    setChosenPose(next);
    setBeforeId(null);
    setAfterId(null);
  };

  const save = async (take: () => Promise<{ fileName: string; takenAt: number } | null>) => {
    setAdding(true);
    try {
      const photo = await take();
      if (!photo) return;
      await addProgressPhoto({ ...photo, pose });
      // Compare against the newest photo again, now that there is a newer one.
      setAfterId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      dialog.show({
        title: tr('Не вдалося додати фото', 'Couldn’t add the photo'),
        message: e instanceof Error ? e.message : String(e),
        icon: 'alert-circle-outline',
      });
    } finally {
      setAdding(false);
    }
  };

  const side = (p: ProgressPhoto, label: string): CompareSide => {
    const w = weightNear(weights, p.takenAt);
    return {
      uri: photoUri(p.fileName),
      label,
      detail: [formatShortDate(p.takenAt), w && `${formatWeight(w.weightKg, 1)} ${WEIGHT_UNIT}`]
        .filter(Boolean)
        .join(' · '),
    };
  };

  const daysSince = latest ? Math.round((today - startOfDay(latest.takenAt)) / DAY_MS) : null;
  const tile = gridWidth > 0 ? (gridWidth - spacing.sm * (COLUMNS - 1)) / COLUMNS : 0;

  return (
    <Screen title={tr('Фото прогресу', 'Progress photos')}>
      <ChipGroup options={PHOTO_POSES} value={pose} onChange={changePose} labels={POSE_LABELS} />

      {comparing ? (
        <Card>
          <PhotoCompare
            before={side(before, tr('До', 'Before'))}
            after={side(after, tr('Після', 'After'))}
          />
          <CompareSummary before={before} after={after} weights={weights} />
        </Card>
      ) : posed.length === 1 ? (
        <Text variant="muted" style={styles.center}>
          {tr(
            'Додай ще одне фото в цій позі, і тут з’явиться порівняння «до / після».',
            'Add one more photo in this pose to get a before / after comparison.',
          )}
        </Text>
      ) : null}

      <Card>
        <Row style={styles.spaceBetween}>
          <Row style={styles.flex}>
            <Ionicons name="camera-outline" size={20} color={colors.accent} />
            <Text variant="heading">
              {tr('Нове фото', 'New photo')} · {POSE_LABELS[pose].toLowerCase()}
            </Text>
          </Row>
          {daysSince !== null && daysSince >= PHOTO_EVERY_DAYS && (
            <Badge label={tr('Час', 'Due')} tone="warning" />
          )}
        </Row>
        <Text variant="muted">
          {daysSince === null
            ? tr(
                'Фотографуйся раз на тиждень: те саме місце, світло й час доби, наприклад зранку натщесерце.',
                'Take a photo once a week in the same spot, light and time of day, e.g. in the morning before eating.',
              )
            : daysSince >= PHOTO_EVERY_DAYS
              ? tr(
                  `Останнє фото було ${formatSpan(daysSince * DAY_MS)} тому — час для нового.`,
                  `The last photo was ${formatSpan(daysSince * DAY_MS)} ago: time for a new one.`,
                )
              : tr(
                  `Наступне фото — через ${formatSpan((PHOTO_EVERY_DAYS - daysSince) * DAY_MS)}.`,
                  `Next photo in ${formatSpan((PHOTO_EVERY_DAYS - daysSince) * DAY_MS)}.`,
                )}
        </Text>
        <Row style={styles.actions}>
          <Button
            title={tr('Камера', 'Camera')}
            icon="camera"
            onPress={() => setShooting(true)}
            disabled={adding}
            style={styles.flex}
          />
          <Button
            title={tr('Галерея', 'Gallery')}
            icon="images-outline"
            variant="secondary"
            onPress={() => save(pickProgressPhoto)}
            disabled={adding}
            style={styles.flex}
          />
        </Row>
      </Card>

      {posed.length === 0 ? (
        <EmptyState
          icon="body-outline"
          title={tr('Ще немає фото', 'No photos yet')}
          hint={tr(
            'Зроби перше фото, щоб потім бачити, як змінюється тіло.',
            'Take your first photo to see how your body changes over time.',
          )}
        />
      ) : (
        <>
          <SectionHeader title={tr('Усі фото', 'All photos')} />
          <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
            {tile > 0 &&
              [...posed].reverse().map((p) => {
                const mark =
                  comparing && p.id === before.id
                    ? tr('До', 'Before')
                    : comparing && p.id === after.id
                      ? tr('Після', 'After')
                      : null;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setViewing(p)}
                    style={({ pressed }) => [{ width: tile }, pressed && styles.pressed]}>
                    <Image
                      source={{ uri: photoUri(p.fileName) }}
                      style={[styles.thumb, { height: (tile * 4) / 3 }, mark && styles.thumbMarked]}
                      contentFit="cover"
                      recyclingKey={String(p.id)}
                    />
                    {mark && (
                      <View style={styles.mark}>
                        <Text style={styles.markText}>{mark}</Text>
                      </View>
                    )}
                    <Text variant="muted" style={styles.center} numberOfLines={1}>
                      {formatShortDate(p.takenAt)}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        </>
      )}

      <PhotoViewer
        photo={viewing}
        weights={weights}
        canCompare={posed.length > 2}
        onClose={() => setViewing(null)}
        onBefore={(p) => {
          setBeforeId(p.id);
          if ((find(afterId) ?? posed.at(-1))?.id === p.id) setAfterId(posed[0].id);
          setViewing(null);
        }}
        onAfter={(p) => {
          setAfterId(p.id);
          if ((find(beforeId) ?? posed[0])?.id === p.id) setBeforeId(posed.at(-1)!.id);
          setViewing(null);
        }}
        onDelete={(p) => {
          if (beforeId === p.id) setBeforeId(null);
          if (afterId === p.id) setAfterId(null);
          setViewing(null);
          deleteProgressPhoto(p);
        }}
      />
      <PoseCamera
        pose={pose}
        visible={shooting}
        onClose={() => setShooting(false)}
        onTaken={(uri) => {
          setShooting(false);
          save(async () => ({ fileName: await storeProgressPhoto(uri), takenAt: Date.now() }));
        }}
      />
      {dialog.element}
    </Screen>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Time and weight change between the compared photos. */
function CompareSummary({
  before,
  after,
  weights,
}: {
  before: ProgressPhoto;
  after: ProgressPhoto;
  weights: Weights;
}) {
  const w1 = weightNear(weights, before.takenAt);
  const w2 = weightNear(weights, after.takenAt);
  return (
    <Row style={styles.spaceBetween}>
      <View>
        <Text variant="caption">{tr('Між фото', 'Between photos')}</Text>
        <Text variant="heading">{capitalize(formatSpan(after.takenAt - before.takenAt))}</Text>
      </View>
      {w1 && w2 && (
        <View style={styles.right}>
          <Text variant="caption">{tr('Вага', 'Weight')}</Text>
          <Text variant="heading">
            {formatWeightDelta(w2.weightKg - w1.weightKg)} {WEIGHT_UNIT}
          </Text>
        </View>
      )}
    </Row>
  );
}

/** Full-screen photo with the actions for it. Deleting asks again in place, not in a second modal. */
function PhotoViewer({
  photo,
  weights,
  canCompare,
  onClose,
  onBefore,
  onAfter,
  onDelete,
}: {
  photo: ProgressPhoto | null;
  weights: Weights;
  canCompare: boolean;
  onClose: () => void;
  onBefore: (p: ProgressPhoto) => void;
  onAfter: (p: ProgressPhoto) => void;
  onDelete: (p: ProgressPhoto) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // Keep the last photo while the modal fades out.
  const [shown, setShown] = useState(photo);
  if (photo && photo !== shown) {
    setShown(photo);
    setConfirming(false);
  }
  const weight = shown && weightNear(weights, shown.takenAt);

  return (
    <Modal visible={!!photo} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.viewer}>
        {shown && (
          <>
            <Row style={styles.viewerHeader}>
              <CircleButton icon="close" onPress={onClose} />
              <View style={styles.flex}>
                <Text variant="heading">{formatDate(shown.takenAt)}</Text>
                <Text variant="muted">
                  {POSE_LABELS[shown.pose]}
                  {weight ? ` · ${formatWeight(weight.weightKg, 1)} ${WEIGHT_UNIT}` : ''}
                </Text>
              </View>
            </Row>
            <Image
              source={{ uri: photoUri(shown.fileName) }}
              style={styles.flex}
              contentFit="contain"
            />
            <View style={styles.viewerActions}>
              {canCompare && !confirming && (
                <Row style={styles.actions}>
                  <Button
                    title={tr('Як «до»', 'As before')}
                    variant="secondary"
                    small
                    onPress={() => onBefore(shown)}
                    style={styles.flex}
                  />
                  <Button
                    title={tr('Як «після»', 'As after')}
                    variant="secondary"
                    small
                    onPress={() => onAfter(shown)}
                    style={styles.flex}
                  />
                </Row>
              )}
              {confirming ? (
                <Row style={styles.actions}>
                  <Button
                    title={tr('Скасувати', 'Cancel')}
                    variant="secondary"
                    onPress={() => setConfirming(false)}
                    style={styles.flex}
                  />
                  <Button
                    title={tr('Видалити', 'Delete')}
                    variant="destructive"
                    icon="trash-outline"
                    onPress={() => onDelete(shown)}
                    style={styles.flex}
                  />
                </Row>
              ) : (
                <Button
                  title={tr('Видалити фото', 'Delete photo')}
                  variant="danger"
                  icon="trash-outline"
                  small
                  onPress={() => setConfirming(true)}
                />
              )}
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  right: { alignItems: 'flex-end' },
  spaceBetween: { justifyContent: 'space-between' },
  actions: { gap: spacing.sm },
  pressed: { opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: {
    width: '100%',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    marginBottom: spacing.xs,
  },
  thumbMarked: { borderWidth: 2, borderColor: colors.accent },
  mark: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  markText: { color: colors.accentText, fontSize: 11, fontWeight: '700' },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerHeader: { gap: spacing.md, padding: spacing.lg },
  viewerActions: { padding: spacing.lg, gap: spacing.sm },
});
