import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTabBarSpace } from '@/components/floating-tab-bar';
import { Sparkline } from '@/components/line-chart';
import { TodayCards } from '@/components/today-cards';
import { Card, CircleButton, Loading, Row, Screen, Text } from '@/components/ui';
import { listBodyWeights } from '@/db/body-weight';
import { loadFood } from '@/db/food';
import { loadWater } from '@/db/water';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatLongDate, formatShortDate, formatWeightDelta } from '@/lib/labels';
import { formatNumber } from '@/lib/metrics';
import { dailyPhrase } from '@/lib/motivation';
import { colors, spacing } from '@/theme';

async function loadHome() {
  const [bodyWeights, water, food] = await Promise.all([
    listBodyWeights(),
    loadWater(),
    loadFood(),
  ]);
  return { bodyWeights, water, food, loadedAt: Date.now() };
}

/** The day at a glance: food, water and body weight. Workouts live in the Training tab. */
export default function HomeScreen() {
  const tabBarSpace = useTabBarSpace();
  const { data } = useDbQuery(loadHome);

  if (!data) return <Loading />;
  const { bodyWeights, water, food, loadedAt } = data;
  const weight = bodyWeights.at(-1);
  const prevWeight = bodyWeights.at(-2);

  return (
    <Screen header={false} bottomSpace={tabBarSpace}>
      <View style={styles.greeting}>
        <Row style={styles.spaceBetween}>
          <Text variant="caption">{formatLongDate(loadedAt)}</Text>
          <Row>
            <CircleButton icon="person-outline" size={36} onPress={() => router.push('/profile')} />
            <CircleButton
              icon="settings-outline"
              size={36}
              onPress={() => router.push('/settings')}
            />
          </Row>
        </Row>
        <Text variant="title">
          {dailyPhrase(new Date(loadedAt))}{' '}
          <Ionicons name="flash" size={26} color={colors.accent} />
        </Text>
      </View>

      <TodayCards
        kcal={food.totals.kcal}
        kcalGoal={food.goal}
        waterMl={water.todayMl}
        waterGoal={water.goal}
      />

      <Card onPress={() => router.push('/body-weight')}>
        <Row style={styles.spaceBetween}>
          <Row>
            <Ionicons name="scale-outline" size={20} color={colors.accent} />
            <Text variant="heading">Вага тіла</Text>
          </Row>
          <Row>
            {weight ? (
              <View style={styles.weightValue}>
                <Text variant="heading">{formatNumber(weight.weightKg, 1)} кг</Text>
                <Text variant="muted">
                  {prevWeight
                    ? `${formatWeightDelta(weight.weightKg - prevWeight.weightKg)} кг · `
                    : ''}
                  {formatShortDate(weight.measuredAt)}
                </Text>
              </View>
            ) : (
              <Text variant="muted">Додати</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
        </Row>
        {bodyWeights.length > 1 && (
          <Sparkline
            points={bodyWeights.slice(-30).map((w) => ({ x: w.measuredAt, y: w.weightKg }))}
          />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: spacing.xs, marginTop: spacing.sm },
  spaceBetween: { justifyContent: 'space-between' },
  weightValue: { alignItems: 'flex-end' },
});
