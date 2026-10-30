import { plural, t } from '@lingui/core/macro';
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
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import { formatDate, formatShortDate, formatWeightDelta } from '@/lib/labels';
import { formatNumber, formatWeight } from '@/lib/metrics';
import { photoUri } from '@/lib/progress-photos';
import { displayToKg, kgToDisplay, unitSystem, WEIGHT_UNIT } from '@/lib/units';
import { forecastGoal, weeklyRate, weightTrend, type GoalForecast } from '@/lib/weight-trend';
import { colors, fontSize, radius, spacing } from '@/theme';

// Where the ruler opens before the first weigh-in, in the display unit.
const START_WEIGHT = unitSystem === 'imperial' ? 160 : 70;

export default function BodyWeightScreen() {
  const { data } = useFocusedDbQuery(listBodyWeights);
  const { data: photos } = useFocusedDbQuery(listProgressPhotos);
  const { data: profile } = useFocusedDbQuery(getProfile);
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
      title: t`Видалити запис?`,
      message: label,
      buttons: [
        { text: t`Скасувати`, style: 'cancel' },
        {
          text: t`Видалити`,
          style: 'destructive',
          onPress: () => deleteBodyWeight(id),
        },
      ],
    });

  const first = data[0];

  return (
    <Screen title={t`Вага тіла`}>
      <Card>
        <Text variant="caption">
          {t`Поточна вага`}, {WEIGHT_UNIT}
        </Text>
        <Row style={styles.entry}>
          <Text style={[styles.current, !latest && styles.currentEmpty]}>
            {latest ? formatWeight(latest.weightKg, 1) : '—'}
          </Text>
          <Button
            title={t`Ввести вагу`}
            icon="scale-outline"
            onPress={() =>
              setEditing(latest ? Number(formatWeight(latest.weightKg, 1)) : START_WEIGHT)
            }
          />
        </Row>
        <Text variant="muted">
          {t`Повторне зважування того ж дня замінить запис.`}
        </Text>
      </Card>

      <PhotosCard photos={photos ?? []} />

      {data.length === 0 ? (
        <EmptyState
          icon="scale-outline"
          title={t`Ще немає записів`}
          hint={t`Додай вагу, і тут з’явиться графік.`}
        />
      ) : (
        <>
          <Row style={styles.stats}>
            <StatTile
              icon="analytics-outline"
              value={formatWeight(trendNow!, 1)}
              unit={WEIGHT_UNIT}
              label={t`Тренд`}
            />
            <StatTile
              icon="speedometer-outline"
              value={rate === null ? '—' : formatWeightDelta(rate)}
              unit={rate === null ? undefined : WEIGHT_UNIT}
              label={t`За тиждень`}
            />
            <StatTile
              icon="trending-up"
              value={formatWeightDelta(trendNow! - first.weightKg)}
              unit={WEIGHT_UNIT}
              label={t`Від початку`}
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
              {t`Графік з’явиться після зважування в інший день.`}
            </Text>
          ) : (
            <Card>
              <Row style={styles.spaceBetween}>
                <Text variant="caption">
                  {t`Вага`}, {WEIGHT_UNIT}
                </Text>
                <Row style={styles.legend}>
                  <Row style={styles.legendItem}>
                    <View style={styles.legendDot} />
                    <Text variant="muted">{t`зважування`}</Text>
                  </Row>
                  <Row style={styles.legendItem}>
                    <View style={styles.legendLine} />
                    <Text variant="muted">{t`тренд`}</Text>
                  </Row>
                </Row>
              </Row>
              <LineChart
                points={data.map((w) => ({ x: w.measuredAt, y: kgToDisplay(w.weightKg) }))}
                trend={data.map((w, i) => ({ x: w.measuredAt, y: kgToDisplay(trend[i]) }))}
                formatY={(v) => formatNumber(v, 1)}
                formatX={formatShortDate}
              />
              <Text variant="muted">
                {t`Тренд згладжує денні коливання води й солі.`}
              </Text>
            </Card>
          )}

          <SectionHeader title={t`Записи`} />
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
        title={t`Цільова вага`}
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
              <Text variant="heading">{t`Цільова вага`}</Text>
              <Text variant="muted">
                {t`Задай ціль, і побачиш, коли досягнеш її за поточним темпом`}
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
    reached: t`Ціль досягнута, тепер утримуй вагу.`,
    unknown: t`Прогноз з’явиться, коли зважування охоплять хоча б тиждень.`,
    stalled: t`Темп ${pace}/тиж зараз не веде до цілі.`,
    far: t`За темпу ${pace}/тиж — більше ніж 2 роки.`,
    date: t`За поточного темпу ${pace}/тиж`,
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
              {t({ message: 'Ціль', context: 'Target' })} {formatWeight(target, 1)} {WEIGHT_UNIT}
              {forecast.kind !== 'reached' &&
                ` · ${t`залишилось`} ${formatWeightDelta(target - trendKg)} ${WEIGHT_UNIT}`}
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
            <Text variant="heading">{t`Фото прогресу`}</Text>
            <Text variant="muted">
              {latest
                ? t`${plural(photos.length, { one: '# фото', other: '# фото' })} · останнє ${formatShortDate(latest.takenAt)}`
                : t`Порівнюй «до / після» щотижня`}
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
  legend: { gap: spacing.md },
  legendItem: { gap: spacing.xs, alignItems: 'center' },
  // Match the weigh-in dots and the trend line drawn by LineChart.
  legendDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textSecondary },
  legendLine: { width: 14, height: 2.5, borderRadius: 1.25, backgroundColor: colors.accent },
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
