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
  IconButton,
  Loading,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
} from '@/components/ui';
import { WeightRulerModal } from '@/components/weight-ruler';
import { deleteBodyWeight, listBodyWeights, saveBodyWeight } from '@/db/body-weight';
import { getProfile, setProfileField } from '@/db/profile';
import { listProgressPhotos } from '@/db/progress-photos';
import { useDbQuery } from '@/hooks/use-db-query';
import { tr } from '@/lib/i18n';
import { formatDate, formatShortDate, formatWeightDelta } from '@/lib/labels';
import { formatNumber, formatWeight } from '@/lib/metrics';
import { photoUri } from '@/lib/progress-photos';
import { displayToKg, kgToDisplay, unitSystem, WEIGHT_UNIT } from '@/lib/units';
import { forecastGoal, weeklyRate, weightTrend, type GoalForecast } from '@/lib/weight-trend';
import { colors, fontSize, radius, spacing } from '@/theme';

// Where the ruler opens before the first weigh-in, in the display unit.
const START_WEIGHT = unitSystem === 'imperial' ? 160 : 70;

export default function BodyWeightScreen() {
  const { data } = useDbQuery(listBodyWeights);
  const { data: photos } = useDbQuery(listProgressPhotos);
  const { data: profile } = useDbQuery(getProfile);
  // The weight the ruler opens on, in the display unit; null keeps it closed.
  const [editing, setEditing] = useState<number | null>(null);
  const [editingTarget, setEditingTarget] = useState<number | null>(null);
  const dialog = useDialog();

  if (!data || !profile) return <Loading />;
  const latest = data.at(-1);
  const trend = weightTrend(data);
  const trendNow = trend.at(-1);
  const rate = weeklyRate(data);
  const target = profile.targetWeightKg;

  const save = (value: number) => {
    saveBodyWeight(displayToKg(value));
    setEditing(null);
  };

  const saveTarget = (value: number) => {
    setProfileField('targetWeightKg', displayToKg(value));
    setEditingTarget(null);
  };

  const editTarget = () => {
    const start = target ?? trendNow;
    setEditingTarget(start ? Number(formatWeight(start, 1)) : START_WEIGHT);
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
              icon="analytics-outline"
              value={formatWeight(trendNow!, 1)}
              unit={WEIGHT_UNIT}
              label={tr('Тренд', 'Trend')}
            />
            <StatTile
              icon="speedometer-outline"
              value={rate === null ? '—' : formatWeightDelta(rate)}
              unit={rate === null ? undefined : WEIGHT_UNIT}
              label={tr('За тиждень', 'Per week')}
            />
            <StatTile
              icon="trending-up"
              value={formatWeightDelta(trendNow! - first.weightKg)}
              unit={WEIGHT_UNIT}
              label={tr('Від початку', 'Since start')}
            />
          </Row>

          <GoalCard
            target={target}
            trendKg={trendNow!}
            rate={rate}
            forecast={
              target === null ? null : forecastGoal(trendNow!, target, rate, latest!.measuredAt)
            }
            onEdit={editTarget}
            onClear={() => setProfileField('targetWeightKg', null)}
          />

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
                trend={data.map((w, i) => ({ x: w.measuredAt, y: kgToDisplay(trend[i]) }))}
                formatY={(v) => formatNumber(v, 1)}
                formatX={formatShortDate}
              />
              <Text variant="muted">
                {tr(
                  'Лінія — згладжений тренд: денні коливання води й солі в ньому майже не видно.',
                  'The line is the smoothed trend: daily swings of water and salt barely show in it.',
                )}
              </Text>
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
      <WeightRulerModal
        value={editingTarget}
        title={tr('Цільова вага', 'Target weight')}
        onClose={() => setEditingTarget(null)}
        onSave={saveTarget}
      />
      {dialog.element}
    </Screen>
  );
}

/** The target weight and when the trend gets there at the current pace. */
function GoalCard({
  target,
  trendKg,
  rate,
  forecast,
  onEdit,
  onClear,
}: {
  target: number | null;
  trendKg: number;
  rate: number | null;
  forecast: GoalForecast | null;
  onEdit: () => void;
  onClear: () => void;
}) {
  if (target === null || !forecast) {
    return (
      <Card onPress={onEdit}>
        <Row style={styles.spaceBetween}>
          <Row style={styles.flex}>
            <Ionicons name="flag-outline" size={22} color={colors.accent} />
            <View style={styles.flex}>
              <Text variant="heading">{tr('Цільова вага', 'Target weight')}</Text>
              <Text variant="muted">
                {tr(
                  'Задай ціль, і побачиш, коли досягнеш її за поточним темпом',
                  'Set a target to see when you reach it at the current pace',
                )}
              </Text>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Row>
      </Card>
    );
  }

  const pace = rate === null ? '' : `${formatWeightDelta(rate)} ${WEIGHT_UNIT}`;
  const hint = {
    reached: tr('Ціль досягнута, тепер утримуй вагу.', 'Target reached, now hold the weight.'),
    unknown: tr(
      'Прогноз з’явиться, коли зважування охоплять хоча б тиждень.',
      'The forecast appears once your weigh-ins span at least a week.',
    ),
    stalled: tr(
      `Темп ${pace}/тиж зараз не веде до цілі.`,
      `At ${pace}/week the trend is not heading to the target.`,
    ),
    far: tr(`За темпу ${pace}/тиж — більше ніж 2 роки.`, `At ${pace}/week, over 2 years away.`),
    date: tr(`За поточного темпу ${pace}/тиж`, `At the current pace of ${pace}/week`),
  }[forecast.kind];

  return (
    <Card onPress={onEdit}>
      <Row style={styles.spaceBetween}>
        <Row style={styles.flex}>
          <Ionicons
            name={forecast.kind === 'reached' ? 'flag' : 'flag-outline'}
            size={22}
            color={colors.accent}
          />
          <View style={styles.flex}>
            <Text variant="caption">
              {tr('Ціль', 'Target')} {formatWeight(target, 1)} {WEIGHT_UNIT}
              {forecast.kind !== 'reached' &&
                ` · ${tr('залишилось', 'to go')} ${formatWeightDelta(target - trendKg)} ${WEIGHT_UNIT}`}
            </Text>
            {forecast.kind === 'date' && (
              <Text variant="heading">~ {formatDate(forecast.at)}</Text>
            )}
            <Text variant={forecast.kind === 'date' ? 'muted' : 'body'}>{hint}</Text>
          </View>
        </Row>
        <IconButton icon="close" size={20} color={colors.textMuted} onPress={onClear} />
      </Row>
    </Card>
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
