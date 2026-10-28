import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { ACTIVITY, ACTIVITY_LEVELS, type ActivityLevel } from '@/lib/profile';
import { colors, radius, spacing } from '@/theme';

/** The activity levels as a list, each with what it means, the selected one filled. */
export function ActivityPicker({
  value,
  onChange,
}: {
  value: ActivityLevel;
  onChange: (level: ActivityLevel) => void;
}) {
  return (
    <View style={styles.options}>
      {ACTIVITY_LEVELS.map((level) => {
        const selected = value === level;
        return (
          <Pressable
            key={level}
            onPress={() => onChange(level)}
            style={[styles.option, selected && styles.optionSelected]}>
            <View style={styles.flex}>
              <Text variant="body" style={selected && styles.optionText}>
                {ACTIVITY[level].label}
              </Text>
              <Text variant="muted" style={selected && styles.optionHint}>
                {ACTIVITY[level].hint}
              </Text>
            </View>
            {selected && <Ionicons name="checkmark" size={20} color={colors.accentText} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  optionSelected: { backgroundColor: colors.accent },
  optionText: { color: colors.accentText },
  optionHint: { color: colors.onAccentMuted },
});
