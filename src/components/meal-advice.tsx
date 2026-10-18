import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AddFoodRow } from '@/components/day-review-card';
import { Spinner } from '@/components/spinner';
import { Button, IconButton, Row, Text } from '@/components/ui';
import { adviseMeal, type StoredMealAdvice } from '@/db/food';
import type { Meal } from '@/db/schema';
import { formatKcal } from '@/lib/food';
import { getGroqKey } from '@/lib/groq';
import { tr } from '@/lib/i18n';
import { colors, radius, spacing } from '@/theme';

const ASK: Record<Meal, string> = {
  breakfast: tr('Що з’їсти на сніданок?', 'What to eat for breakfast?'),
  lunch: tr('Що з’їсти на обід?', 'What to eat for lunch?'),
  dinner: tr('Що з’їсти на вечерю?', 'What to eat for dinner?'),
  snack: tr('Що з’їсти на перекус?', 'What to eat for a snack?'),
};

/**
 * Today's meal card: a button that asks AI what to eat for `meal` to cover its
 * share of what's left of the day, and the dishes it suggested, each opened on
 * its card on tap. Asked only on tap; hidden without a Groq key.
 */
export function MealAdvice({
  meal,
  day,
  stored,
  signature,
}: {
  meal: Meal;
  day: number;
  stored: StoredMealAdvice | undefined;
  /** The day's current state; the advice is behind when its signature differs. */
  signature: string;
}) {
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getGroqKey().then((key) => setHasKey(!!key));
    }, []),
  );

  const run = async () => {
    setLoading(true);
    setFailed(null);
    try {
      await adviseMeal(meal);
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!hasKey) return null;
  const advice = stored?.advice;
  const fresh = stored?.signature === signature;

  if (!advice) {
    return (
      <View style={styles.block}>
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={run}
          style={({ pressed }) => [styles.ask, pressed && styles.pressed]}>
          <Ionicons name="sparkles" size={18} color={colors.accent} />
          <Text variant="body" style={[styles.flex, styles.askLabel]}>
            {loading ? tr('Підбираю страву…', 'Picking a meal…') : ASK[meal]}
          </Text>
          {loading && <Spinner color={colors.textSecondary} />}
        </Pressable>
        {failed && !loading && <Error message={failed} onRetry={run} />}
      </View>
    );
  }

  const kcal = advice.dishes.reduce((s, d) => s + d.kcal, 0);
  return (
    <View style={[styles.block, styles.advice]}>
      <Row style={styles.header}>
        <Ionicons name="sparkles" size={16} color={colors.accent} />
        <Text variant="caption" style={styles.flex}>
          {tr('Порада AI', 'AI suggests')} · {formatKcal(kcal)} {tr('ккал', 'kcal')}
        </Text>
        {loading ? (
          <Spinner color={colors.textSecondary} />
        ) : (
          <IconButton
            icon="refresh"
            size={18}
            onPress={run}
            // Accent: the log changed since the advice was given.
            color={fresh ? colors.textSecondary : colors.accent}
          />
        )}
      </Row>
      <View style={[styles.body, loading && styles.stale]}>
        {!!advice.comment && <Text variant="secondary">{advice.comment}</Text>}
        {advice.dishes.map((dish) => (
          <AddFoodRow
            key={dish.text}
            food={dish}
            day={day}
            meal={meal}
            meta={`${formatKcal(dish.kcal)} ${tr('ккал', 'kcal')} · ${tr('Б', 'P')} ${Math.round(dish.proteinG)} · ${tr('Ж', 'F')} ${Math.round(dish.fatG ?? 0)} · ${tr('В', 'C')} ${Math.round(dish.carbsG ?? 0)}`}
          />
        ))}
      </View>
      {failed && !loading && <Error message={failed} onRetry={run} />}
    </View>
  );
}

function Error({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Row style={styles.error}>
      <Text variant="muted" style={styles.flex}>
        {message}
      </Text>
      <Button title={tr('Ще раз', 'Retry')} variant="secondary" small onPress={onRetry} />
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: spacing.sm, marginBottom: spacing.sm },
  ask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.glassBorder,
  },
  askLabel: { fontWeight: '700' },
  advice: { paddingTop: spacing.xs },
  header: { gap: spacing.sm },
  body: { gap: spacing.sm },
  // The advice being replaced, shown while the new one is on its way.
  stale: { opacity: 0.5 },
  pressed: { opacity: 0.6 },
  error: { gap: spacing.md },
});
