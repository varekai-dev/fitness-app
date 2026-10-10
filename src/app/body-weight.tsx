import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

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
import { formatDate, formatShortDate, formatWeightDelta } from '@/lib/labels';
import { formatNumber, parseDecimal } from '@/lib/metrics';
import { spacing } from '@/theme';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function BodyWeightScreen() {
  const { data } = useDbQuery(listBodyWeights);
  // null until the user types, so the field shows the latest weight to adjust.
  const [input, setInput] = useState<string | null>(null);

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
    Alert.alert('Видалити запис?', label, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => deleteBodyWeight(id) },
    ]);

  // Change over the last 30 days, measured from the earliest entry inside that window.
  const monthAgo = latest ? latest.measuredAt - 30 * DAY_MS : 0;
  const monthStart = data.find((w) => w.measuredAt >= monthAgo);
  const first = data[0];

  return (
    <Screen title="Вага тіла">
      <Card>
        <Text variant="caption">Сьогоднішня вага, кг</Text>
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
          <Button title="Зберегти" icon="checkmark" disabled={!valid} onPress={save} />
        </Row>
        <Text variant="muted">Повторне зважування того ж дня замінить запис.</Text>
      </Card>

      {data.length === 0 ? (
        <EmptyState
          icon="scale-outline"
          title="Ще немає записів"
          hint="Додай вагу, і тут з’явиться графік."
        />
      ) : (
        <>
          <Row style={styles.stats}>
            <StatTile
              icon="scale-outline"
              value={formatNumber(latest!.weightKg, 1)}
              unit="кг"
              label="Зараз"
            />
            <StatTile
              icon="calendar"
              value={formatWeightDelta(latest!.weightKg - monthStart!.weightKg)}
              unit="кг"
              label="За 30 днів"
            />
            <StatTile
              icon="trending-up"
              value={formatWeightDelta(latest!.weightKg - first.weightKg)}
              unit="кг"
              label="Від початку"
            />
          </Row>

          {data.length === 1 ? (
            <Text variant="muted" style={styles.chartHint}>
              Графік з’явиться після зважування в інший день.
            </Text>
          ) : (
            <Card>
              <Text variant="caption">Вага, кг</Text>
              <LineChart
                points={data.map((w) => ({ x: w.measuredAt, y: w.weightKg }))}
                formatY={(v) => formatNumber(v, 1)}
                formatX={formatShortDate}
              />
            </Card>
          )}

          <SectionHeader title="Записи" />
          {[...data].reverse().map((w, i, list) => {
            const prev = list[i + 1];
            const label = `${formatDate(w.measuredAt)} · ${formatNumber(w.weightKg, 1)} кг`;
            return (
              <Card key={w.id} onPress={() => remove(w.id, label)}>
                <Row style={styles.spaceBetween}>
                  <Text variant="body">{formatDate(w.measuredAt)}</Text>
                  <View style={styles.entryValue}>
                    <Text variant="heading">{formatNumber(w.weightKg, 1)} кг</Text>
                    {prev && (
                      <Text variant="muted">
                        {formatWeightDelta(w.weightKg - prev.weightKg)} кг
                      </Text>
                    )}
                  </View>
                </Row>
              </Card>
            );
          })}
        </>
      )}
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
