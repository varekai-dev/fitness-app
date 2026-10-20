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
import { loadRecapData, type RecapData } from '@/db/recap';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatGrams, formatKcal } from '@/lib/food';
import { plural, tr } from '@/lib/i18n';
import { formatShortDate } from '@/lib/labels';
import { formatMetric, formatTonnage } from '@/lib/metrics';
import { MODULE_INFO, useEnabledModules, useModuleOrder, type AppModule } from '@/lib/modules';
import {
  computeFoodRecap,
  computeRecap,
  computeWaterRecap,
  periodRange,
  RECAP_PERIODS,
  type FoodRecap,
  type PeriodRange,
  type Recap,
  type RecapPeriod,
  type WaterRecap,
} from '@/lib/recap';
import { formatVolumeCompact } from '@/lib/units';
import { colors, fontSize, radius, spacing } from '@/theme';

const PERIOD_LABELS: Record<RecapPeriod, string> = {
  month: tr('Місяць', 'Month'),
  year: tr('Рік', 'Year'),
};

/** Records shown on the card; the rest are listed under it. */
const CARD_RECORDS = 3;

/** The sections that have a recap, each shown only while its tab is switched on. */
const RECAP_MODULES = ['training', 'food', 'water'] as const;
type RecapModule = (typeof RECAP_MODULES)[number];
const isRecapModule = (m: AppModule): m is RecapModule =>
  (RECAP_MODULES as readonly string[]).includes(m);

type Recaps = { training: Recap; food: FoodRecap; water: WaterRecap };

function computeAll(data: RecapData, range: PeriodRange): Recaps {
  return {
    training: computeRecap(data.workouts, range),
    food: computeFoodRecap(data.food, data.kcalGoal, range),
    water: computeWaterRecap(data.water, data.waterGoal, range),
  };
}

const hasData = (m: RecapModule, r: Recaps) =>
  m === 'training' ? r.training.workouts > 0 : r[m].loggedDays > 0;

/** The earliest entry of the shown sections, so the period arrows stop there. */
function oldestEntry(data: RecapData, modules: RecapModule[]) {
  const times = [
    ...(modules.includes('training') ? data.workouts.map((w) => w.startedAt) : []),
    ...(modules.includes('food') ? data.food.map((e) => e.eatenAt) : []),
    ...(modules.includes('water') ? data.water.map((i) => i.drankAt) : []),
  ];
  return times.length ? Math.min(...times) : undefined;
}

const pluralDays = (n: number) => plural(n, ['день', 'дні', 'днів'], ['day', 'days']);

function formatHours(ms: number) {
  const min = Math.round(ms / 60_000);
  return min < 60
    ? { value: String(min), unit: tr('хв', 'min') }
    : { value: String(Math.round(min / 6) / 10), unit: tr('год', 'h') };
}

/**
 * A month or a year in numbers: workouts, volume and records, calories and
 * the usual dish, water drunk. Sections follow the tabs that are switched on.
 */
export default function RecapScreen() {
  const { data } = useDbQuery(loadRecapData);
  const enabled = useEnabledModules();
  const modules = useModuleOrder().filter(
    (m): m is RecapModule => isRecapModule(m) && enabled.includes(m),
  );
  const [period, setPeriod] = useState<RecapPeriod>('month');
  // 0 is the current month or year, 1 the one before…
  const [offset, setOffset] = useState(0);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const range = periodRange(period, offset);
  const recaps = computeAll(data, range);
  const shown = modules.filter((m) => hasData(m, recaps));
  // Nothing to go back to before the first entry.
  const oldest = oldestEntry(data, modules);
  const canGoBack = oldest !== undefined && range.from > oldest;
  const records = shown.includes('training') ? recaps.training.records : [];

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

      {shown.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={tr('Нічого не записано', 'Nothing logged')}
          hint={tr(
            'Підсумки з’являться, щойно за цей період буде тренування, їжа чи вода.',
            'The recap appears once this period has a workout, a meal or a drink.',
          )}
        />
      ) : (
        <>
          {/* collapsable: Android drops plain wrapper views, and the capture needs this one. */}
          <View ref={cardRef} collapsable={false} style={styles.cardShot}>
            <RecapCard label={range.label} modules={shown} recaps={recaps} />
          </View>
          <Button
            title={tr('Поділитися', 'Share')}
            icon="share-outline"
            loading={sharing}
            onPress={share}
          />

          {records.length > CARD_RECORDS && (
            <>
              <SectionHeader title={tr('Усі рекорди', 'All records')} />
              {records.map((r) => (
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

/** The picture that gets shared: a grey card like the rest of the app, big numbers, no buttons. */
function RecapCard({
  label,
  modules,
  recaps,
}: {
  label: string;
  modules: RecapModule[];
  recaps: Recaps;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.glow} />
      <Row style={styles.brand}>
        <Ionicons name="barbell" size={16} color={colors.accent} />
        <RNText style={styles.brandText}>Fitness · {tr('підсумки', 'recap')}</RNText>
      </Row>
      <RNText style={styles.period}>{label}</RNText>
      {modules.map((m) => (
        <View key={m} style={styles.section}>
          <Row style={styles.sectionTitle}>
            <Ionicons name={MODULE_INFO[m].icon} size={14} color={colors.accent} />
            <RNText style={styles.sectionTitleText}>{MODULE_INFO[m].title}</RNText>
          </Row>
          {m === 'training' ? (
            <TrainingSection recap={recaps.training} />
          ) : m === 'food' ? (
            <FoodSection recap={recaps.food} />
          ) : (
            <WaterSection recap={recaps.water} />
          )}
        </View>
      ))}
    </View>
  );
}

function TrainingSection({ recap }: { recap: Recap }) {
  const tonnage = formatTonnage(recap.tonnageKg);
  const time = formatHours(recap.durationMs);
  const records = recap.records.slice(0, CARD_RECORDS);
  return (
    <>
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
              <Ionicons name="trophy" size={14} color={colors.accent} />
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
    </>
  );
}

function FoodSection({ recap }: { recap: FoodRecap }) {
  return (
    <>
      <View style={styles.grid}>
        <BigStat
          value={formatKcal(recap.avgKcal)}
          unit={tr('ккал', 'kcal')}
          label={tr('у середньому за день', 'a day on average')}
        />
        <BigStat
          value={formatGrams(Math.round(recap.avgProteinG))}
          unit={tr('г', 'g')}
          label={tr('білка за день', 'protein a day')}
        />
        <BigStat
          value={String(recap.daysWithinGoal)}
          unit={`/ ${recap.loggedDays}`}
          label={tr('днів у межах цілі', 'days within goal')}
        />
        <BigStat
          value={String(recap.loggedDays)}
          label={`${pluralDays(recap.loggedDays)} ${tr('із записами', 'logged')}`}
        />
      </View>
      {recap.favorite && (
        <View style={styles.block}>
          <RNText style={styles.blockTitle}>{tr('Найчастіша страва', 'Most logged dish')}</RNText>
          <RNText style={styles.favorite} numberOfLines={1}>
            {recap.favorite.name}
          </RNText>
          <RNText style={styles.muted}>
            {recap.favorite.times}{' '}
            {plural(recap.favorite.times, ['раз', 'рази', 'разів'], ['time', 'times'])}
          </RNText>
        </View>
      )}
    </>
  );
}

function WaterSection({ recap }: { recap: WaterRecap }) {
  return (
    <View style={styles.grid}>
      <BigStat value={formatVolumeCompact(recap.totalMl)} label={tr('випито', 'drunk')} />
      <BigStat
        value={formatVolumeCompact(recap.avgMl)}
        label={tr('у середньому за день', 'a day on average')}
      />
      <BigStat
        value={String(recap.daysAtGoal)}
        unit={`/ ${recap.loggedDays}`}
        label={tr('днів з нормою', 'days at goal')}
      />
      <BigStat
        value={formatVolumeCompact(recap.bestDayMl)}
        label={tr('найбільше за день', 'best day')}
      />
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.accentSoft,
    opacity: 0.5,
  },
  brand: { gap: spacing.xs, alignItems: 'center' },
  brandText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700' },
  period: {
    color: colors.text,
    fontSize: fontSize.xxl + 4,
    fontWeight: '800',
    marginTop: -spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  stat: { width: '50%', gap: 2 },
  statValue: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  statUnit: { fontSize: fontSize.md, fontWeight: '700' },
  muted: { color: colors.textSecondary, fontSize: fontSize.sm },
  section: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceRaised,
  },
  sectionTitle: { gap: spacing.xs, alignItems: 'center' },
  sectionTitleText: { color: colors.accent, fontSize: fontSize.md, fontWeight: '800' },
  block: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceRaised,
  },
  blockTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  favorite: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  record: { gap: spacing.sm, alignItems: 'center' },
  recordName: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  recordValue: { color: colors.accent, fontSize: fontSize.md, fontWeight: '800' },
});
