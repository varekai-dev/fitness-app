import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { MACROS } from '@/components/calorie-summary';
import { Row, Text } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { colors, fontSize, radius, spacing } from '@/theme';

// The fields of a dish typed in or fixed by hand, laid out like the card of a
// dish AI counted: the name as its heading, kcal large, protein / fat / carbs
// as tiles in their colours.

export type MacroInputKey = 'kcal' | 'proteinG' | 'fatG' | 'carbsG';
export type MacroInputValues = Record<MacroInputKey, string>;

/** What a number field keeps of a typed text. */
export const digits = (t: string) => t.replace(/[^\d.,]/g, '');

/** The dish name as the card's heading, with a pencil to show it can be changed. */
export function NameInput(props: TextInputProps) {
  return (
    <Row style={styles.name}>
      <TextInput
        placeholderTextColor={colors.textMuted}
        maxLength={80}
        style={styles.nameInput}
        {...props}
      />
      <Ionicons name="pencil" size={16} color={colors.textMuted} />
    </Row>
  );
}

/** The dish's kcal in large type. */
export function KcalInput({
  value,
  onChangeText,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <Row style={styles.kcal}>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(digits(t))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        selectTextOnFocus
        maxLength={6}
        autoFocus={autoFocus}
        style={styles.kcalInput}
      />
      <Text style={styles.kcalUnit}>{tr('ккал', 'kcal')}</Text>
    </Row>
  );
}

/** Protein, fat and carbs as three tiles in their colours, each a grams field. */
export function MacroInputRow({
  values,
  onChange,
}: {
  values: MacroInputValues;
  onChange: (key: MacroInputKey, text: string) => void;
}) {
  return (
    <Row style={styles.macros}>
      {MACROS.map((m) => (
        // The macro's colour at ~12% opacity, as on the AI card.
        <View key={m.key} style={[styles.macro, { backgroundColor: `${m.color}1F` }]}>
          <Row style={styles.macroValue}>
            <TextInput
              value={values[m.key]}
              onChangeText={(t) => onChange(m.key, digits(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={`${m.color}80`}
              selectTextOnFocus
              maxLength={6}
              style={[styles.macroInput, { color: m.color }]}
            />
            <Text variant="heading" style={{ color: m.color }}>
              {tr('г', 'g')}
            </Text>
          </Row>
          <Text variant="muted">{m.label}</Text>
        </View>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  name: {
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.glassBorder,
  },
  nameInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
  },
  kcal: { alignItems: 'baseline', gap: spacing.xs },
  kcalInput: {
    color: colors.text,
    fontSize: fontSize.xxl + 4,
    fontWeight: '800',
    padding: 0,
  },
  kcalUnit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  macros: { alignSelf: 'stretch', marginTop: spacing.sm },
  macro: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  macroValue: { alignItems: 'baseline', gap: 2 },
  macroInput: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    padding: 0,
  },
});
