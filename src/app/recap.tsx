import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { useDialog } from '@/components/dialog';
import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  IconButton,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { listFinishedWorkouts } from '@/db/workouts';
import { useDbQuery } from '@/hooks/use-db-query';
import { plural, tr } from '@/lib/i18n';
import { formatShortDate } from '@/lib/labels';
import { formatMetric, formatTonnage } from '@/lib/metrics';
import {
  computeRecap,
  periodRange,
  RECAP_PERIODS,
  type Recap,
  type RecapPeriod,
} from '@/lib/recap';
import { colors, fontSize, radius, spacing } from '@/theme';

const PERIOD_LABELS: Record<RecapPeriod, string> = {
  month: tr('Місяць', 'Month'),
  year: tr('Рік', 'Year'),
};

/** Records shown on the card; the rest are listed under it. */
const CARD_RECORDS = 3;

function formatHours(ms: number) {
  const min = Math.round(ms / 60_000);
  return min < 60
    ? { value: String(min), unit: tr('хв', 'min') }
    : { value: String(Math.round(min / 6) / 10), unit: tr('год', 'h') };
}

/** Workouts, volume, time, the favorite exercise and records of a month or a year. */
export default function RecapScreen() {
  const { data } = useDbQuery(listFinishedWorkouts);
  const [period, setPeriod] = useState<RecapPeriod>('month');
  // 0 is the current month or year, 1 the one before…
  const [offset, setOffset] = useState(0);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const range = periodRange(period, offset);
  const recap = computeRecap(data, range);
  // Nothing to go back to before the first workout.
  const oldest = data.at(-1)?.startedAt;
  const canGoBack = oldest !== undefined && range.from > oldest;

  const share = async () => {
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: tr('Поділитися підсумками', 'Share the recap'),
      });
    } catch (e) {
      dialog.show({
        title: tr('Не вдалося поділитися', 'Could not share'),
        message: (e as Error).message,
        icon: 'alert-circle',
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen title={tr('Підсумки', 'Recap')}>
      <ChipGroup
        options={RECAP_PERIODS}
        value={period}
        labels={PERIOD_LABELS}
        onChange={(p) => {
          setPeriod(p);
          setOffset(0);
        }}
      />
      <Row style={styles.nav}>
        <IconButton
          icon="chevron-back"
          disabled={!canGoBack}
          onPress={() => setOffset((o) => o + 1)}
        />
        <Text variant="heading">{range.label}</Text>
        <IconButton
          icon="chevron-forward"
          disabled={offset === 0}
          onPress={() => setOffset((o) => o - 1)}
        />
      </Row>

      {recap.workouts === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={tr('Тренувань не було', 'No workouts')}
          hint={tr(
            'Підсумки з’являться після першого завершеного тренування за цей період.',
            'The recap appears after the first finished workout in this period.',
          )}
        />
      ) : (
        <>
          {/* collapsable: Android drops plain wrapper views, and the capture needs this one. */}
          <View ref={cardRef} collapsable={false} style={styles.cardShot}>
            <RecapCard label={range.label} recap={recap} />
          </View>
          <Button
            title={tr('Поділитися', 'Share')}
            icon="share-outline"
            loading={sharing}
            onPress={share}
          />

          {recap.records.length > CARD_RECORDS && (
            <>
              <SectionHeader title={tr('Усі рекорди', 'All records')} />
              {recap.records.map((r) => (
                <Card key={r.exerciseId}>
                  <Row style={styles.spaceBetween}>
                    <View style={styles.flex}>
                      <Text variant="body" numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text variant="muted">{formatShortDate(r.date)}</Text>
                    </View>
                    <Text variant="heading">{formatMetric(r.type, r.value)}</Text>
                  </Row>
                </Card>
              ))}
            </>
          )}
        </>
      )}
      {dialog.element}
    </Screen>
  );
}

/** The picture that gets shared: accent background, big numbers, no buttons. */
function RecapCard({ label, recap }: { label: string; recap: Recap }) {
  const tonnage = formatTonnage(recap.tonnageKg);
  const time = formatHours(recap.durationMs);
  const records = recap.records.slice(0, CARD_RECORDS);

  return (
    <View style={styles.card}>
      <View style={styles.glow} />
      <Row style={styles.brand}>
        <Ionicons name="barbell" size={16} color={colors.accentText} />
        <RNText style={styles.brandText}>Fitness · {tr('підсумки', 'recap')}</RNText>
      </Row>
      <RNText style={styles.period}>{label}</RNText>

      <View style={styles.grid}>
        <BigStat
          value={String(recap.workouts)}
          label={plural(
            recap.workouts,
            ['тренування', 'тренування', 'тренувань'],
            ['workout', 'workouts'],
          )}
        />
        <BigStat value={tonnage.value} unit={tonnage.unit} label={tr('тоннаж', 'volume')} />
        <BigStat value={time.value} unit={time.unit} label={tr('у залі', 'training')} />
        <BigStat
          value={String(recap.activeDays)}
          label={plural(
            recap.activeDays,
            ['активний день', 'активні дні', 'активних днів'],
            ['active day', 'active days'],
          )}
        />
      </View>

      {recap.favorite && (
        <View style={styles.block}>
          <RNText style={styles.blockTitle}>{tr('Улюблена вправа', 'Favorite exercise')}</RNText>
          <RNText style={styles.favorite} numberOfLines={1}>
            {recap.favorite.name}
          </RNText>
          <RNText style={styles.muted}>
            {recap.favorite.workouts}{' '}
            {plural(
              recap.favorite.workouts,
              ['тренування', 'тренування', 'тренувань'],
              ['workout', 'workouts'],
            )}{' '}
            · {recap.favorite.sets}{' '}
            {plural(recap.favorite.sets, ['підхід', 'підходи', 'підходів'], ['set', 'sets'])}
          </RNText>
        </View>
      )}

      <View style={styles.block}>
        <RNText style={styles.blockTitle}>
          {tr('Особисті рекорди', 'Personal records')}: {recap.records.length}
        </RNText>
        {records.length === 0 ? (
          <RNText style={styles.muted}>
            {tr('Цього разу без нових рекордів', 'No new records this time')}
          </RNText>
        ) : (
          records.map((r) => (
            <Row key={r.exerciseId} style={styles.record}>
              <Ionicons name="trophy" size={14} color={colors.accentText} />
              <RNText style={styles.recordName} numberOfLines={1}>
                {r.name}
              </RNText>
              {(r.type === 'weight_reps' || r.type === 'weighted_reps') && (
                <RNText style={styles.muted}>{tr('1ПМ', '1RM')}</RNText>
              )}
              <RNText style={styles.recordValue}>{formatMetric(r.type, r.value)}</RNText>
            </Row>
          ))
        )}
      </View>
    </View>
  );
}

function BigStat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={styles.stat}>
      <RNText style={styles.statValue} numberOfLines={1}>
        {value}
        {unit ? <RNText style={styles.statUnit}> {unit}</RNText> : null}
      </RNText>
      <RNText style={styles.muted} numberOfLines={1}>
        {label}
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spaceBetween: { justifyContent: 'space-between', gap: spacing.md },
  nav: { justifyContent: 'space-between', alignItems: 'center' },
  cardShot: { borderRadius: radius.lg, overflow: 'hidden' },
  card: {
    backgroundColor: colors.accent,
    padding: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    right: -70,
    top: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accentGradientEnd,
    opacity: 0.6,
  },
  brand: { gap: spacing.xs, alignItems: 'center' },
  brandText: { color: colors.accentText, fontSize: fontSize.sm, fontWeight: '700' },
  period: {
    color: colors.accentText,
    fontSize: fontSize.xxl + 4,
    fontWeight: '800',
    marginTop: -spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  stat: { width: '50%', gap: 2 },
  statValue: { color: colors.accentText, fontSize: fontSize.xxl, fontWeight: '800' },
  statUnit: { fontSize: fontSize.md, fontWeight: '700' },
  muted: { color: colors.onAccentMuted, fontSize: fontSize.sm },
  block: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.onAccentMuted,
  },
  blockTitle: {
    color: colors.onAccentMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  favorite: { color: colors.accentText, fontSize: fontSize.lg, fontWeight: '800' },
  record: { gap: spacing.sm, alignItems: 'center' },
  recordName: { flex: 1, color: colors.accentText, fontSize: fontSize.md, fontWeight: '600' },
  recordValue: { color: colors.accentText, fontSize: fontSize.md, fontWeight: '800' },
});
