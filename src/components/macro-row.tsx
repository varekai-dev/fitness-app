import { StyleSheet, View } from 'react-native';

import { MACROS } from '@/components/calorie-summary';
import { Row, Text } from '@/components/ui';
import { formatGrams, type Macros } from '@/lib/food';
import { tr } from '@/lib/i18n';
import { radius, spacing } from '@/theme';

/** Protein, fat and carbs as three tiles, each in its macro's colour. */
export function MacroRow({ macros }: { macros: Macros }) {
  return (
    <Row style={styles.macros}>
      {MACROS.map((m) => (
        // The macro's colour at ~12% opacity, a shade quieter than the food log's pills.
        <View key={m.key} style={[styles.macro, { backgroundColor: `${m.color}1F` }]}>
          <Text variant="heading" style={{ color: m.color }}>
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
  },
});
