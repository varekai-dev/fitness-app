import { StyleSheet, View } from 'react-native';

import { Row, Text } from '@/components/ui';
import { formatGrams, type Macros } from '@/lib/food';
import { colors, radius, spacing } from '@/theme';

const MACROS = [
  { key: 'proteinG', label: 'Білки' },
  { key: 'fatG', label: 'Жири' },
  { key: 'carbsG', label: 'Вуглеводи' },
] as const;

/** Protein, fat and carbs as three tiles. */
export function MacroRow({ macros }: { macros: Macros }) {
  return (
    <Row style={styles.macros}>
      {MACROS.map((m) => (
        <View key={m.key} style={styles.macro}>
          <Text variant="heading">{formatGrams(macros[m.key])} г</Text>
          <Text variant="muted">{m.label}</Text>
        </View>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  macros: { alignSelf: 'stretch', marginTop: spacing.sm },
  macro: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
});
