import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { MACROS } from '@/components/calorie-summary';
import { Row, Text } from '@/components/ui';
import { selectOnFocus } from '@/hooks/select-on-focus';
import { useDeferredFocus } from '@/hooks/use-deferred-focus';
import { colors, fontSize, radius, spacing } from '@/theme';

// The fields of a dish typed in or fixed by hand, laid out like the card of a
// dish AI counted: the name as its heading, kcal large, protein / fat / carbs
// as tiles in their colours.

export type MacroInputKey = 'kcal' | 'proteinG' | 'fatG' | 'carbsG';
export type MacroInputValues = Record<MacroInputKey, string>;

/** What a number field keeps of a typed text. */
export const digits = (t: string) => t.replace(/[^\d.,]/g, '');

/** The dish name as the card's heading, with a pencil to show it can be changed. */
export function NameInput({ autoFocus, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const input = useDeferredFocus(autoFocus);
  return (
    <Row style={[styles.name, focused && styles.focusedLine]}>
      <TextInput
        ref={input}
        placeholderTextColor={colors.textMuted}
        maxLength={80}
        style={styles.nameInput}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
      />
      <Ionicons name="pencil" size={16} color={focused ? colors.accent : colors.textMuted} />
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
  const [focused, setFocused] = useState(false);
  const input = useDeferredFocus(autoFocus);
  // The whole row focuses the field, not just its digits.
  return (
    <Pressable
      onPress={() => input.current?.focus()}
      style={[styles.kcal, focused && styles.focusedLine]}>
      <TextInput
        ref={input}
        onFocus={() => {
          setFocused(true);
          selectOnFocus(input, value);
        }}
        onBlur={() => setFocused(false)}
        value={value}
        onChangeText={(t) => onChangeText(digits(t))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        maxLength={6}
        style={styles.kcalInput}
      />
      <Text style={styles.kcalUnit}>{t`ккал`}</Text>
    </Pressable>
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
        <MacroTile
          key={m.key}
          label={m.label}
          color={m.color}
          value={values[m.key]}
          onChangeText={(t) => onChange(m.key, t)}
        />
      ))}
    </Row>
  );
}

/** One macro's grams field on a tile in its colour; the whole tile focuses it. */
function MacroTile({
  label,
  color,
  value,
  onChangeText,
}: {
  label: string;
  color: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInputInstance>(null);
  return (
    <Pressable
      onPress={() => input.current?.focus()}
      // The macro's colour at ~12% opacity, as on the AI card; outlined in it while typed into.
      style={[styles.macro, { backgroundColor: `${color}1F` }, focused && { borderColor: color }]}>
      <Row style={styles.macroValue}>
        <TextInput
          ref={input}
          value={value}
          onChangeText={(t) => onChangeText(digits(t))}
          onFocus={() => {
            setFocused(true);
            selectOnFocus(input, value);
          }}
          onBlur={() => setFocused(false)}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={`${color}80`}
            maxLength={6}
          style={[styles.macroInput, { color }]}
        />
        <Text variant="heading" style={{ color }}>
          {t`г`}
        </Text>
      </Row>
      <Text variant="muted">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  focusedLine: { borderBottomColor: colors.accent },
  name: {
    gap: spacing.sm,
    borderBottomWidth: 1,
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
  kcal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  macroValue: { alignItems: 'baseline', gap: 2 },
  macroInput: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    padding: 0,
  },
});
