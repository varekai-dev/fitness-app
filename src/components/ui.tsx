import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, fontSize, radius, spacing } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type TextVariant = 'title' | 'heading' | 'body' | 'secondary' | 'muted' | 'caption';

export function Text({
  variant = 'body',
  style,
  children,
  numberOfLines,
}: {
  variant?: TextVariant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <RNText style={[styles[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </RNText>
  );
}

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView
      style={styles.screenScroll}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = BUTTON_FG[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: BUTTON_BG[variant] },
        variant === 'secondary' && styles.buttonBorder,
        (pressed || disabled) && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <RNText style={[styles.buttonText, { color: fg }]}>{title}</RNText>
        </>
      )}
    </Pressable>
  );
}

const BUTTON_BG: Record<ButtonVariant, string> = {
  primary: colors.accent,
  secondary: colors.surfaceRaised,
  danger: colors.surfaceRaised,
  ghost: 'transparent',
};
const BUTTON_FG: Record<ButtonVariant, string> = {
  primary: colors.accentText,
  secondary: colors.text,
  danger: colors.danger,
  ghost: colors.accent,
};

export function IconButton({
  icon,
  onPress,
  color = colors.textSecondary,
  disabled,
  size = 22,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, (pressed || disabled) && styles.pressed]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Field({
  label,
  style,
  containerStyle,
  ...props
}: TextInputProps & {
  label?: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, containerStyle]}>
      {label && <Text variant="secondary">{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, props.multiline && styles.inputMultiline, style]}
        {...props}
      />
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <RNText style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</RNText>
    </Pressable>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o} label={labels[o]} selected={o === value} onPress={() => onChange(o)} />
      ))}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading">{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <Text variant="secondary" style={styles.center}>
        {title}
      </Text>
      {hint && (
        <Text variant="muted" style={styles.center}>
          {hint}
        </Text>
      )}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.row, style]}>{children}</View>
);

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '700' },
  heading: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  body: { color: colors.text, fontSize: fontSize.md },
  secondary: { color: colors.textSecondary, fontSize: fontSize.md },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  caption: { color: colors.textSecondary, fontSize: fontSize.sm },
  screenScroll: { flex: 1, backgroundColor: colors.background },
  screen: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2, flexGrow: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  buttonBorder: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  buttonText: { fontSize: fontSize.md, fontWeight: '600' },
  iconButton: { padding: spacing.xs },
  field: { gap: spacing.xs },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontSize: fontSize.md,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '500' },
  chipTextSelected: { color: colors.accentText },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  center: { textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
