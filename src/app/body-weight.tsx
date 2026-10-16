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
import { formatNumber, parseDecimal } from '@/lib/metrics';
import { spacing } from '@/theme';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function BodyWeightScreen() {
  const { data } = useDbQuery(listBodyWeights);
  // null until the user types, so the field shows the latest weight to adjust.
  const [input, setInput] = useState<string | null>(null);
  const dialog = useDialog();

  if (!data) return <Loading />;
  const latest = data.at(-1);
  const value = input ?? (latest ? formatNumber(latest.weightKg, 1) : '');
  const parsed = parseDecimal(value);
  const valid = parsed !== null && parsed > 0 && parsed < 500;

  const save = () => {
    if (!valid) return;
    saveBodyWeight(parsed);
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
        <Text variant="caption">{tr('Сьогоднішня вага, кг', 'Today’s weight, kg')}</Text>
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
              value={formatNumber(latest!.weightKg, 1)}
              unit={tr('кг', 'kg')}
              label={tr('Зараз', 'Now')}
            />
            <StatTile
              icon="calendar"
              value={formatWeightDelta(latest!.weightKg - monthStart!.weightKg)}
              unit={tr('кг', 'kg')}
              label={tr('За 30 днів', '30 days')}
            />
            <StatTile
              icon="trending-up"
              value={formatWeightDelta(latest!.weightKg - first.weightKg)}
              unit={tr('кг', 'kg')}
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
              <Text variant="caption">{tr('Вага, кг', 'Weight, kg')}</Text>
              <LineChart
                points={data.map((w) => ({ x: w.measuredAt, y: w.weightKg }))}
                formatY={(v) => formatNumber(v, 1)}
                formatX={formatShortDate}
              />
            </Card>
          )}

          <SectionHeader title={tr('Записи', 'Entries')} />
          {[...data].reverse().map((w, i, list) => {
            const prev = list[i + 1];
            const label = `${formatDate(w.measuredAt)} · ${formatNumber(w.weightKg, 1)} ${tr('кг', 'kg')}`;
            return (
              <Card key={w.id} onPress={() => remove(w.id, label)}>
                <Row style={styles.spaceBetween}>
                  <Text variant="body">{formatDate(w.measuredAt)}</Text>
                  <View style={styles.entryValue}>
                    <Text variant="heading">
                      {formatNumber(w.weightKg, 1)} {tr('кг', 'kg')}
                    </Text>
                    {prev && (
                      <Text variant="muted">
                        {formatWeightDelta(w.weightKg - prev.weightKg)} {tr('кг', 'kg')}
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
