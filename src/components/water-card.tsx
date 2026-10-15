import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui';
import { addWater } from '@/db/water';
import type { GlassPreset } from '@/lib/water';
import { colors, radius, spacing } from '@/theme';

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

const styles = StyleSheet.create({
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
