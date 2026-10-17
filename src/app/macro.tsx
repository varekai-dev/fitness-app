import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MACROS } from '@/components/calorie-summary';
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { adviseMacro, loadMacro, type StoredMacroTips } from '@/db/food';
import { useDbQuery } from '@/hooks/use-db-query';
import { useToday } from '@/hooks/use-today';
import { formatGrams, formatKcal } from '@/lib/food';
import { getGroqKey, type MacroFood, type MacroKey } from '@/lib/groq';
import { locale, tr } from '@/lib/i18n';
import { MEAL_LABELS, mealAt, mealOf } from '@/lib/meals';
import { colors, fontSize, radius, spacing } from '@/theme';

const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });

// "Rich in …" per macro.
const RICH_IN = {
  proteinG: tr('Багато білка', 'Rich in protein'),
  fatG: tr('Багато жирів', 'Rich in fat'),
  carbsG: tr('Багато вуглеводів', 'Rich in carbs'),
};

/**
 * One macro of a day: the dishes it came from, richest first, and AI's foods
 * rich in it; tapping one opens adding food with it filled in.
 */
export default function MacroScreen() {
  const params = useLocalSearchParams<{ macro?: string; day?: string }>();
  const macro = MACROS.find((m) => m.key === params.macro) ?? MACROS[0];
  const today = useToday();
  const parsedDay = Number(params.day);
  const day = Number.isFinite(parsedDay) && params.day ? parsedDay : today;
  const { data } = useDbQuery(() => loadMacro(macro.key, day), [macro.key, day]);

  if (!data) return <Loading />;
  const { entries, total, target, tips, signature } = data;
  const left = target - total;
  const g = tr('г', 'g');

  return (
    <Screen title={macro.label} mode="modal">
      <Card style={styles.summary}>
        <Text style={styles.amount}>
          {formatGrams(total)}
          <Text style={styles.unit}> {g}</Text>
        </Text>
        <Text variant="muted">
          {tr('з', 'of')} {formatGrams(Math.round(target))} {g} ·{' '}
          {left >= 0
            ? tr(
                `лишилось ${formatGrams(Math.round(left))} ${g}`,
                `${formatGrams(Math.round(left))} ${g} left`,
              )
            : tr(
                `понад ціль ${formatGrams(Math.round(-left))} ${g}`,
                `${formatGrams(Math.round(-left))} ${g} over`,
              )}
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              {
                width: `${target > 0 ? Math.min(total / target, 1) * 100 : 0}%`,
                backgroundColor: macro.color,
              },
            ]}
          />
        </View>
      </Card>

      <SectionHeader title={tr('Звідки за день', 'Where it came from')} />
      {entries.length === 0 ? (
        <EmptyState
          icon="restaurant-outline"
          title={tr('За цей день ще нічого', 'Nothing on this day yet')}
        />
      ) : (
        <Card style={styles.list}>
          {entries.map((e, i) => {
            const grams = e[macro.key];
            const share = total > 0 ? grams / total : 0;
            return (
              <View key={e.id} style={[styles.entry, i > 0 && styles.divider]}>
                <Row style={styles.entryHead}>
                  <View style={styles.flex}>
                    <Text variant="body" numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text variant="muted" numberOfLines={1}>
                      {MEAL_LABELS[mealOf(e)]} · {timeFormatter.format(new Date(e.eatenAt))}
                      {e.portion ? ` · ${e.portion}` : ''}
                    </Text>
                  </View>
                  <View style={styles.entryValue}>
                    <Text variant="heading">
                      {formatGrams(grams)} {g}
                    </Text>
                    <Text variant="muted">{Math.round(share * 100)}%</Text>
                  </View>
                </Row>
                <View style={styles.shareTrack}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${share * 100}%`, backgroundColor: macro.color },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <TipsCard
        macroKey={macro.key}
        day={day}
        tips={tips}
        signature={signature}
        color={macro.color}
      />
    </Screen>
  );
}

function TipsCard({
  macroKey,
  day,
  tips,
  signature,
  color,
}: {
  macroKey: MacroKey;
  day: number;
  tips: StoredMacroTips | null;
  /** The day's current state; `tips` are stale when their signature differs. */
  signature: string;
  color: string;
}) {
  // Hidden without a Groq key.
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // The day's state AI was last asked about: asked once by itself, even if it failed,
  // and not again while the answer is still on its way to the stored tips.
  const [asked, setAsked] = useState<string | null>(null);

  useEffect(() => {
    getGroqKey().then((key) => setHasKey(!!key));
  }, []);

  const fresh = tips?.signature === signature;

  const run = useCallback(async () => {
    setAsked(signature);
    setLoading(true);
    setFailed(null);
    try {
      await adviseMacro(macroKey, day);
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [macroKey, day, signature]);

  useEffect(() => {
    if (!hasKey || fresh || asked === signature) return;
    const timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
  }, [hasKey, fresh, asked, signature, run]);

  if (!hasKey) return null;
  const shown = tips?.tips;

  return (
    <Card style={styles.tips}>
      <Row style={styles.tipsHeader}>
        <View style={styles.icon}>
          <Ionicons name="sparkles" size={16} color={colors.accent} />
        </View>
        <Text variant="caption" style={styles.flex}>
          {RICH_IN[macroKey]}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          shown && (
            <IconButton icon="refresh" size={18} onPress={run} color={colors.textSecondary} />
          )
        )}
      </Row>

      {shown ? (
        <View style={[styles.tipsBody, !fresh && styles.stale]}>
          {!!shown.comment && <Text variant="secondary">{shown.comment}</Text>}
          {shown.foods.map((food) => (
            <FoodRow key={food.text} food={food} day={day} color={color} />
          ))}
        </View>
      ) : (
        loading && <Text variant="muted">{tr('Підбираю продукти…', 'Picking foods…')}</Text>
      )}

      {failed && !loading && (
        <Row style={styles.error}>
          <Text variant="muted" style={styles.flex}>
            {failed}
          </Text>
          <Button title={tr('Ще раз', 'Retry')} variant="secondary" small onPress={run} />
        </Row>
      )}
    </Card>
  );
}

function FoodRow({ food, day, color }: { food: MacroFood; day: number; color: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/add-food',
          params: { meal: mealAt(Date.now()), day: String(day), text: food.text },
        })
      }
      style={({ pressed }) => [styles.food, pressed && styles.pressed]}>
      <Ionicons name="add-circle" size={20} color={colors.accent} />
      <Text variant="body" style={styles.flex} numberOfLines={2}>
        {food.text}
      </Text>
      <View style={styles.entryValue}>
        <Text variant="body" style={{ color }}>
          {formatGrams(Math.round(food.grams))} {tr('г', 'g')}
        </Text>
        <Text variant="muted">
          {formatKcal(food.kcal)} {tr('ккал', 'kcal')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { gap: spacing.xs },
  amount: { color: colors.text, fontSize: fontSize.hero, fontWeight: '800', letterSpacing: -1 },
  unit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  track: {
    height: 6,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  tips: { gap: spacing.md },
  tipsHeader: { gap: spacing.sm },
  icon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsBody: { gap: spacing.sm },
  // Tips picked before the latest dishes, shown while new ones are on their way.
  stale: { opacity: 0.5 },
  food: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  pressed: { opacity: 0.6 },
  error: { gap: spacing.md },
  list: { gap: 0, paddingVertical: spacing.xs },
  entry: { gap: spacing.sm, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  entryHead: { gap: spacing.md },
  entryValue: { alignItems: 'flex-end' },
  shareTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
});
