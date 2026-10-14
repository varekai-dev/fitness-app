import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Row, Text } from '@/components/ui';
import { WaterBottle } from '@/components/water-bottle';
import { addWater } from '@/db/water';
import { formatMl, QUICK_GLASSES, type GlassPreset } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

/** Logs a glass with haptic feedback; a stronger buzz when it reaches the goal. */
export async function drinkWater(ml: number, todayMl: number, goal: number) {
  await addWater(ml);
  if (todayMl < goal && todayMl + ml >= goal) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/** Icon tile for one container size; `compact` drops the name for tight rows. */
export function GlassButton({
  glass,
  onPress,
  compact,
}: {
  glass: GlassPreset;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Додати ${glass.label.toLowerCase()}, ${glass.ml} мл`}
      style={({ pressed }) => [
        styles.glass,
        compact && styles.glassCompact,
        pressed && styles.glassPressed,
      ]}>
      <MaterialCommunityIcons name={glass.icon} size={compact ? 20 : 28} color={colors.accent} />
      {!compact && <Text variant="caption">{glass.label}</Text>}
      <Text variant="body" style={styles.glassMl}>
        +{glass.ml}
      </Text>
    </Pressable>
  );
}

/** Home screen summary: the sloshing bottle, today's total and quick-add glasses. */
export function WaterCard({ todayMl, goal }: { todayMl: number; goal: number }) {
  const progress = goal > 0 ? todayMl / goal : 0;
  const done = todayMl >= goal;
  return (
    <Card onPress={() => router.navigate('/water')} style={styles.card}>
      <Row style={styles.body}>
        <WaterBottle progress={progress} height={200} />
        <View style={styles.info}>
          <Row style={styles.title}>
            <Ionicons name="water" size={18} color={colors.accent} />
            <Text variant="heading">Вода</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
              style={styles.chevron}
            />
          </Row>
          <View>
            <Text style={styles.amount}>
              {formatMl(todayMl)}
              <Text style={styles.unit}> мл</Text>
            </Text>
            <Text variant="muted">
              {done ? 'Ціль виконано!' : `ще ${formatMl(goal - todayMl)} мл`}
            </Text>
          </View>
          <View>
            <Text variant="caption" style={styles.goalLabel}>
              ЦІЛЬ
            </Text>
            <Text variant="heading">{formatMl(goal)}</Text>
          </View>
          <Row style={styles.quick}>
            {QUICK_GLASSES.map((g) => (
              <GlassButton
                key={g.ml}
                glass={g}
                compact
                onPress={() => drinkWater(g.ml, todayMl, goal)}
              />
            ))}
          </Row>
        </View>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.lg },
  body: { alignItems: 'stretch', gap: spacing.lg },
  info: { flex: 1, justifyContent: 'space-between', gap: spacing.sm },
  title: { gap: spacing.xs },
  chevron: { marginLeft: 'auto' },
  amount: { color: colors.text, fontSize: fontSize.xxl + 6, fontWeight: '800', letterSpacing: -1 },
  unit: { color: colors.textSecondary, fontSize: fontSize.lg, fontWeight: '600' },
  goalLabel: { letterSpacing: 1 },
  quick: { gap: spacing.sm },
  glass: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  glassCompact: { paddingVertical: spacing.sm },
  glassPressed: { opacity: 0.6, transform: [{ scale: 0.96 }] },
  glassMl: { fontWeight: '700' },
});
