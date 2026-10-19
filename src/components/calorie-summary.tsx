import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { GrowArc, GrowBar } from '@/components/motion';
import { Card, Row, Text } from '@/components/ui';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { formatGrams, formatKcal, type Macros } from '@/lib/food';
import type { MacroKey } from '@/lib/groq';
import { tr } from '@/lib/i18n';
import { colors, fontSize, radius, spacing } from '@/theme';

const SIZE = 210;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const LENGTH = 2 * Math.PI * R;
// A 270° arc open at the bottom.
const ARC = LENGTH * 0.75;

export const MACROS = [
  { key: 'proteinG', label: tr('Білки', 'Protein'), kcalPerG: 4, color: colors.protein },
  { key: 'fatG', label: tr('Жири', 'Fat'), kcalPerG: 9, color: colors.fat },
  { key: 'carbsG', label: tr('Вуглеводи', 'Carbs'), kcalPerG: 4, color: colors.carbs },
] as const;

/** Calories eaten against the goal, and the protein / fat / carbs split below it. */
export function CalorieSummary({
  totals,
  goal,
  onPress,
  onMacroPress,
}: {
  totals: Macros;
  goal: number;
  onPress?: () => void;
  onMacroPress?: (macro: MacroKey) => void;
}) {
  // Counts up or down when food is added or removed.
  const kcal = Math.round(useAnimatedNumber(totals.kcal));
  const left = goal - kcal;
  const over = left < 0;
  const macroKcal = MACROS.map((m) => totals[m.key] * m.kcalPerG);
  const macroSum = macroKcal.reduce((s, k) => s + k, 0);

  return (
    <Card style={styles.card} onPress={onPress}>
      {onPress && (
        // The whole card opens the goal settings; the pencil says so.
        <Ionicons name="pencil" size={16} color={colors.textMuted} style={styles.edit} />
      )}
      <View style={styles.gauge}>
        <Svg width={SIZE} height={SIZE} style={styles.arc}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={colors.surfaceRaised}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={[ARC, LENGTH]}
            fill="none"
          />
          <GrowArc
            size={SIZE}
            stroke={STROKE}
            color={over ? colors.warning : colors.accent}
            progress={goal > 0 ? totals.kcal / goal : 0}
            sweep={0.75}
          />
        </Svg>
        <Ionicons
          name={over ? 'warning' : 'flame'}
          size={22}
          color={over ? colors.warning : colors.accent}
        />
        <Text style={[styles.amount, over && styles.over]}>{formatKcal(Math.abs(left))}</Text>
        <Text variant="caption">
          {over ? tr('ккал понад ціль', 'kcal over goal') : tr('ккал залишилось', 'kcal left')}
        </Text>
        <View style={styles.eaten}>
          <Text variant="muted">
            {formatKcal(kcal)} / {formatKcal(goal)}
          </Text>
        </View>
      </View>

      <Row style={styles.macros}>
        {MACROS.map((m, i) => {
          const share = macroSum > 0 ? macroKcal[i] / macroSum : 0;
          return (
            <Pressable
              key={m.key}
              accessibilityRole="button"
              disabled={!onMacroPress}
              onPress={() => onMacroPress?.(m.key)}
              style={({ pressed }) => [styles.macro, pressed && styles.pressed]}>
              <Row style={styles.macroHead}>
                <View style={[styles.dot, { backgroundColor: m.color }]} />
                <Text variant="muted" numberOfLines={1} style={styles.flex}>
                  {m.label}
                </Text>
              </Row>
              <Text variant="heading">
                {formatGrams(totals[m.key])}
                <Text variant="muted"> {tr('г', 'g')}</Text>
              </Text>
              <GrowBar progress={share} color={m.color} style={styles.track} />
              <Text variant="muted" style={styles.share}>
                {Math.round(share * 100)}% {tr('ккал', 'kcal')}
              </Text>
            </Pressable>
          );
        })}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { alignItems: 'center', paddingTop: spacing.xl },
  edit: { position: 'absolute', top: spacing.lg, right: spacing.lg },
  gauge: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  // Starts the arc at the bottom left, so its opening faces down.
  arc: { position: 'absolute', transform: [{ rotate: '135deg' }] },
  amount: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
  over: { color: colors.warning },
  // Sits in the arc's opening.
  eaten: { position: 'absolute', bottom: spacing.sm },
  macros: { alignSelf: 'stretch', gap: spacing.sm, marginTop: -spacing.sm },
  macro: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  macroHead: { gap: spacing.xs + 2 },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  share: { fontSize: fontSize.xs },
  pressed: { opacity: 0.6 },
});
