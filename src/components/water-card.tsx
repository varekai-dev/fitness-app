import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui';
import { addWater } from '@/db/water';
import { tr } from '@/lib/i18n';
import { formatVolume, VOLUME_UNIT } from '@/lib/units';
import type { GlassPreset } from '@/lib/water';
import { colors, radius, spacing } from '@/theme';

/** Logs a glass of water. */
export async function drinkWater(ml: number) {
  await addWater(ml);
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
      accessibilityLabel={tr(
        `Додати ${glass.label.toLowerCase()}, ${formatVolume(glass.ml)} ${VOLUME_UNIT}`,
        `Add ${glass.label.toLowerCase()}, ${formatVolume(glass.ml)} ${VOLUME_UNIT}`,
      )}
      style={({ pressed }) => [
        styles.glass,
        compact && styles.glassCompact,
        pressed && styles.glassPressed,
      ]}>
      <MaterialCommunityIcons name={glass.icon} size={compact ? 20 : 28} color={colors.accent} />
      {!compact && <Text variant="caption">{glass.label}</Text>}
      <Text variant="body" style={styles.glassMl}>
        +{formatVolume(glass.ml)}
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
