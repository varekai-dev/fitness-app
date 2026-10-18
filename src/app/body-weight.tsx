import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { LineChart } from '@/components/line-chart';
import {
  Button,
  Card,
  EmptyState,
  Loading,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
} from '@/components/ui';
import { WeightRulerModal } from '@/components/weight-ruler';
import { deleteBodyWeight, listBodyWeights, saveBodyWeight } from '@/db/body-weight';
import { listProgressPhotos } from '@/db/progress-photos';
import { useDbQuery } from '@/hooks/use-db-query';
import { tr } from '@/lib/i18n';
import { formatDate, formatShortDate, formatWeightDelta } from '@/lib/labels';
import { formatNumber, formatWeight } from '@/lib/metrics';
import { photoUri } from '@/lib/progress-photos';
import { displayToKg, kgToDisplay, unitSystem, WEIGHT_UNIT } from '@/lib/units';
import { colors, fontSize, radius, spacing } from '@/theme';

const DAY_MS = 24 * 60 * 60 * 1000;
// Where the ruler opens before the first weigh-in, in the display unit.
const START_WEIGHT = unitSystem === 'imperial' ? 160 : 70;

export default function BodyWeightScreen() {
  const { data } = useDbQuery(listBodyWeights);
  const { data: photos } = useDbQuery(listProgressPhotos);
  // The weight the ruler opens on, in the display unit; null keeps it closed.
  const [editing, setEditing] = useState<number | null>(null);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const latest = data.at(-1);

  const save = (value: number) => {
    saveBodyWeight(displayToKg(value));
    setEditing(null);
  };

  const remove = (id: number, label: string) =>
    dialog.show({
      title: tr('Видалити запис?', 'Delete entry?'),
      message: label,
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        {
          text: tr('Видалити', 'Delete'),
          style: 'destructive',
          onPress: () => deleteBodyWeight(id),
        },
      ],
    });

  // Change over the last 30 days, measured from the earliest entry inside that window.
  const monthAgo = latest ? latest.measuredAt - 30 * DAY_MS : 0;
  const monthStart = data.find((w) => w.measuredAt >= monthAgo);
  const first = data[0];

  return (
    <Screen title={tr('Вага тіла', 'Body weight')}>
      <Card>
        <Text variant="caption">
          {tr('Поточна вага', 'Current weight')}, {WEIGHT_UNIT}
        </Text>
        <Row style={styles.entry}>
          <Text style={[styles.current, !latest && styles.currentEmpty]}>
            {latest ? formatWeight(latest.weightKg, 1) : '—'}
          </Text>
          <Button
            title={tr('Ввести вагу', 'Enter weight')}
            icon="scale-outline"
            onPress={() =>
              setEditing(latest ? Number(formatWeight(latest.weightKg, 1)) : START_WEIGHT)
            }
          />
        </Row>
        <Text variant="muted">
          {tr(
            'Повторне зважування того ж дня замінить запис.',
            'Weighing in again on the same day replaces the entry.',
          )}
        </Text>
      </Card>

      <PhotosCard photos={photos ?? []} />

      {data.length === 0 ? (
        <EmptyState
          icon="scale-outline"
          title={tr('Ще немає записів', 'No entries yet')}
          hint={tr(
            'Додай вагу, і тут з’явиться графік.',
            'Add your weight and a chart appears here.',
          )}
        />
      ) : (
        <>
          <Row style={styles.stats}>
            <StatTile
              icon="scale-outline"
              value={formatWeight(latest!.weightKg, 1)}
              unit={WEIGHT_UNIT}
              label={tr('Зараз', 'Now')}
            />
            <StatTile
              icon="calendar"
              value={formatWeightDelta(latest!.weightKg - monthStart!.weightKg)}
              unit={WEIGHT_UNIT}
              label={tr('За 30 днів', '30 days')}
            />
            <StatTile
              icon="trending-up"
              value={formatWeightDelta(latest!.weightKg - first.weightKg)}
              unit={WEIGHT_UNIT}
              label={tr('Від початку', 'Since start')}
            />
          </Row>

          {data.length === 1 ? (
            <Text variant="muted" style={styles.chartHint}>
              {tr(
                'Графік з’явиться після зважування в інший день.',
                'The chart appears after a weigh-in on another day.',
              )}
            </Text>
          ) : (
            <Card>
              <Text variant="caption">
                {tr('Вага', 'Weight')}, {WEIGHT_UNIT}
              </Text>
              <LineChart
                points={data.map((w) => ({ x: w.measuredAt, y: kgToDisplay(w.weightKg) }))}
                formatY={(v) => formatNumber(v, 1)}
                formatX={formatShortDate}
              />
            </Card>
          )}

          <SectionHeader title={tr('Записи', 'Entries')} />
          {[...data].reverse().map((w, i, list) => {
            const prev = list[i + 1];
            const label = `${formatDate(w.measuredAt)} · ${formatWeight(w.weightKg, 1)} ${WEIGHT_UNIT}`;
            return (
              <Card key={w.id} onPress={() => remove(w.id, label)}>
                <Row style={styles.spaceBetween}>
                  <Text variant="body">{formatDate(w.measuredAt)}</Text>
                  <View style={styles.entryValue}>
                    <Text variant="heading">
                      {formatWeight(w.weightKg, 1)} {WEIGHT_UNIT}
                    </Text>
                    {prev && (
                      <Text variant="muted">
                        {formatWeightDelta(w.weightKg - prev.weightKg)} {WEIGHT_UNIT}
                      </Text>
                    )}
                  </View>
                </Row>
              </Card>
            );
          })}
        </>
      )}
      <WeightRulerModal value={editing} onClose={() => setEditing(null)} onSave={save} />
      {dialog.element}
    </Screen>
  );
}

/** Link to the progress photos, with the latest one as a preview. */
function PhotosCard({ photos }: { photos: { fileName: string; takenAt: number }[] }) {
  const latest = photos.at(-1);
  return (
    <Card onPress={() => router.push('/progress-photos')}>
      <Row style={styles.spaceBetween}>
        <Row style={styles.flex}>
          {latest ? (
            <Image
              source={{ uri: photoUri(latest.fileName) }}
              style={styles.photoThumb}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.photoThumb, styles.photoPlaceholder]}>
              <Ionicons name="body-outline" size={22} color={colors.accent} />
            </View>
          )}
          <View style={styles.flex}>
            <Text variant="heading">{tr('Фото прогресу', 'Progress photos')}</Text>
            <Text variant="muted">
              {latest
                ? tr(
                    `${photos.length} фото · останнє ${formatShortDate(latest.takenAt)}`,
                    `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} · last ${formatShortDate(latest.takenAt)}`,
                  )
                : tr('Порівнюй «до / після» щотижня', 'Compare before / after every week')}
            </Text>
          </View>
        </Row>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entry: { gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between' },
  current: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  currentEmpty: { color: colors.textMuted },
  stats: { gap: spacing.sm, alignItems: 'stretch' },
  spaceBetween: { justifyContent: 'space-between' },
  entryValue: { alignItems: 'flex-end' },
  chartHint: { textAlign: 'center' },
  photoThumb: {
    width: 44,
    height: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  photoPlaceholder: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
