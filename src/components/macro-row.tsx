import { StyleSheet, View } from 'react-native';

import { Row, Text } from '@/components/ui';
import { formatGrams, type Macros } from '@/lib/food';
import { tr } from '@/lib/i18n';
import { colors, radius, spacing } from '@/theme';

const MACROS = [
  { key: 'proteinG', label: tr('Білки', 'Protein') },
  { key: 'fatG', label: tr('Жири', 'Fat') },
  { key: 'carbsG', label: tr('Вуглеводи', 'Carbs') },
] as const;

/** Protein, fat and carbs as three tiles. */
export function MacroRow({ macros }: { macros: Macros }) {
  return (
    <Row style={styles.macros}>
      {MACROS.map((m) => (
        <View key={m.key} style={styles.macro}>
          <Text variant="heading">
            {formatGrams(macros[m.key])} {tr('г', 'g')}
          </Text>
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
