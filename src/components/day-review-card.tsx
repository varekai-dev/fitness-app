import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, IconButton, Row, Text } from '@/components/ui';
import { reviewDay, type StoredReview } from '@/db/food';
import { formatGrams, formatKcal } from '@/lib/food';
import { getGroqKey, type DayFood } from '@/lib/groq';
import { tr } from '@/lib/i18n';
import { colors, radius, spacing } from '@/theme';

// Logging a few dishes in a row asks AI once, for the last of them.
const SETTLE_MS = 800;

/**
 * AI's short take on the day's food, written when the Food tab shows a day
 * whose stored comment is missing or stale, and for today a few snacks that
 * close the gap; tapping one opens adding food on that dish's card.
 */
export function DayReviewCard({
  day,
  isToday,
  stored,
  signature,
}: {
  day: number;
  isToday: boolean;
  stored: StoredReview | null;
  /** The day's current state; `stored` is stale when its signature differs. */
  signature: string;
}) {
  const [focused, setFocused] = useState(false);
  // Hidden without a Groq key; checked again on focus, after a visit to settings.
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(false);
  // An error with the signature it happened for: not retried by itself until the day changes.
  const [failed, setFailed] = useState<{ signature: string; message: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      getGroqKey().then((key) => setHasKey(!!key));
      return () => setFocused(false);
    }, []),
  );

  const fresh = stored?.signature === signature;

  const run = useCallback(async () => {
    setLoading(true);
    setFailed(null);
    try {
      await reviewDay(day);
    } catch (e) {
      setFailed({ signature, message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [day, signature]);

  useEffect(() => {
    if (!focused || !hasKey || fresh || loading || failed?.signature === signature) return;
    const timer = setTimeout(run, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [focused, hasKey, fresh, loading, failed, signature, run]);

  if (!hasKey) return null;
  const review = stored?.review;

  return (
    <Card style={styles.card}>
      <Row style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="sparkles" size={16} color={colors.accent} />
        </View>
        <Text variant="caption" style={styles.flex}>
          {tr('AI-коментар до дня', 'AI on your day')}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          review && (
            <IconButton icon="refresh" size={18} onPress={run} color={colors.textSecondary} />
          )
        )}
      </Row>

      {review ? (
        <View style={[styles.body, !fresh && styles.stale]}>
          <Text variant="heading">{review.headline}</Text>
          {!!review.comment && <Text variant="secondary">{review.comment}</Text>}
          {!!review.foods?.length && (
            <View style={styles.foods}>
              {review.foods.map((food) => (
                <FoodRow key={food.name} food={food} />
              ))}
            </View>
          )}
          {isToday &&
            review.snacks.map((snack) => (
              <AddFoodRow
                key={snack.text}
                text={snack.text}
                day={day}
                meta={`${formatKcal(snack.kcal)} ${tr('ккал', 'kcal')} · ${tr('Б', 'P')} ${formatGrams(Math.round(snack.proteinG))} ${tr('г', 'g')}`}
              />
            ))}
          {!!review.fill?.length && (
            <View style={styles.fill}>
              <Text variant="caption">
                {review.fillTitle ||
                  (isToday
                    ? tr('Цього бракує до денної норми', 'Still missing for the day')
                    : tr('Цього бракувало до денної норми', 'What the day was missing'))}
              </Text>
              {review.fill.map((food) => (
                <AddFoodRow
                  key={food.text}
                  text={food.text}
                  day={day}
                  meta={`${formatKcal(food.kcal)} ${tr('ккал', 'kcal')} · ${tr('Б', 'P')} ${Math.round(food.proteinG)} · ${tr('Ж', 'F')} ${Math.round(food.fatG)} · ${tr('В', 'C')} ${Math.round(food.carbsG)}`}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        loading && (
          <Text variant="muted">{tr('Дивлюся, як минає день…', 'Looking at your day…')}</Text>
        )
      )}

      {failed && !loading && (
        <Row style={styles.error}>
          <Text variant="muted" style={styles.flex}>
            {failed.message}
          </Text>
          <Button title={tr('Ще раз', 'Retry')} variant="secondary" small onPress={run} />
        </Row>
      )}
    </Card>
  );
}

function FoodRow({ food }: { food: DayFood }) {
  return (
    <Row style={styles.food}>
      <Ionicons
        name={food.good ? 'checkmark-circle' : 'alert-circle'}
        size={18}
        color={food.good ? colors.success : colors.warning}
      />
      <Text variant="body" style={styles.flex}>
        {food.name}
        {!!food.note && <Text variant="muted"> — {food.note}</Text>}
      </Text>
    </Row>
  );
}

/** A food AI suggests, opened in the add-food screen as a snack on tap. */
function AddFoodRow({ text, meta, day }: { text: string; meta: string; day: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/add-food',
          params: { meal: 'snack', day: String(day), text },
        })
      }
      style={({ pressed }) => [styles.snack, pressed && styles.pressed]}>
      <Ionicons name="add-circle" size={20} color={colors.accent} />
      <View style={styles.flex}>
        <Text variant="body" numberOfLines={2}>
          {text}
        </Text>
        <Text variant="muted">{meta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md },
  header: { gap: spacing.sm },
  icon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: spacing.sm },
  foods: { gap: spacing.xs },
  fill: { gap: spacing.sm },
  food: { gap: spacing.sm, alignItems: 'flex-start' },
  // A comment written before the latest dishes, shown while the new one is on its way.
  stale: { opacity: 0.5 },
  snack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  pressed: { opacity: 0.6 },
  error: { gap: spacing.md },
});
