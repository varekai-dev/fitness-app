import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { LineChart } from '@/components/line-chart';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
} from '@/components/ui';
import { deleteBodyWeight, listBodyWeights, saveBodyWeight } from '@/db/body-weight';
import { useDbQuery } from '@/hooks/use-db-query';
import { tr } from '@/lib/i18n';
import { formatDate, formatShortDate, formatWeightDelta } from '@/lib/labels';
import { formatNumber, formatWeight, parseDecimal } from '@/lib/metrics';
import { displayToKg, kgToDisplay, WEIGHT_UNIT } from '@/lib/units';
import { spacing } from '@/theme';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function BodyWeightScreen() {
  const { data } = useDbQuery(listBodyWeights);
  // null until the user types, so the field shows the latest weight to adjust.
  const [input, setInput] = useState<string | null>(null);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const latest = data.at(-1);
  const value = input ?? (latest ? formatWeight(latest.weightKg, 1) : '');
  const parsed = parseDecimal(value);
  const kg = parsed === null ? null : displayToKg(parsed);
  const valid = kg !== null && kg > 0 && kg < 500;

  const save = () => {
    if (!valid) return;
    saveBodyWeight(kg);
    setInput(null);
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
          {tr('Сьогоднішня вага', 'Today’s weight')}, {WEIGHT_UNIT}
        </Text>
        <Row style={styles.entry}>
          <Field
            value={value}
            onChangeText={setInput}
            keyboardType="decimal-pad"
            placeholder="0.0"
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={save}
            containerStyle={styles.flex}
          />
          <Button
            title={tr('Зберегти', 'Save')}
            icon="checkmark"
            disabled={!valid}
            onPress={save}
          />
        </Row>
        <Text variant="muted">
          {tr(
            'Повторне зважування того ж дня замінить запис.',
            'Weighing in again on the same day replaces the entry.',
          )}
        </Text>
      </Card>

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
      {dialog.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entry: { gap: spacing.sm, alignItems: 'center' },
  stats: { gap: spacing.sm, alignItems: 'stretch' },
  spaceBetween: { justifyContent: 'space-between' },
  entryValue: { alignItems: 'flex-end' },
  chartHint: { textAlign: 'center' },
});
