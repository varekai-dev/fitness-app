import { Pressable, StyleSheet } from 'react-native';

import { Row, Text } from '@/components/ui';
import { MEAL_LABELS, MEALS, type Meal } from '@/lib/meals';
import { colors, radius, spacing } from '@/theme';

/** Which meal the food goes to, as a row of chips. */
export function MealPicker({ meal, onChange }: { meal: Meal; onChange: (meal: Meal) => void }) {
  return (
    <Row style={styles.chips}>
      {MEALS.map((m) => (
        <Pressable
          key={m}
          onPress={() => {
            if (m === meal) return;
            onChange(m);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: m === meal }}
          style={[styles.chip, m === meal && styles.chipActive]}>
          <Text
            variant="body"
            numberOfLines={1}
            style={[styles.text, m === meal && styles.textActive]}>
            {MEAL_LABELS[m]}
          </Text>
        </Pressable>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: 2,
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.accent },
  text: { color: colors.textSecondary, fontWeight: '700' },
  textActive: { color: colors.accentText },
});
