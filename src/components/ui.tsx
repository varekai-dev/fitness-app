import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
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
import { LayoutAnimationConfig } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop, Glass } from '@/components/glass';
import { PressScale } from '@/components/motion';
import { Spinner } from '@/components/spinner';
import { useDeferredFocus } from '@/hooks/use-deferred-focus';
import { useScrollResetOnTabLeave } from '@/hooks/use-scroll-reset-on-tab-leave';
import { colors, fontSize, radius, spacing } from '@/theme';

/** Space between the blocks of a `Screen`. */
export const SCREEN_GAP = spacing.lg;

export type IconName = ComponentProps<typeof Ionicons>['name'];

type TextVariant =
  'hero' | 'title' | 'heading' | 'body' | 'secondary' | 'muted' | 'caption' | 'overline';

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

/** Round glass button used for back/close and toolbar actions. */
export function CircleButton({
  icon,
  onPress,
  color = colors.text,
  background,
  size = 44,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  /** Tints the glass, e.g. darker over photos. */
  background?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      hitSlop={6}
      style={({ pressed }) => (pressed || disabled) && styles.pressed}>
      <Glass
        interactive
        tint={background}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name={icon} size={size * 0.45} color={color} />
      </Glass>
    </Pressable>
  );
}

type HeaderMode = 'root' | 'back' | 'modal';

/** Falls back to home when the screen was opened without history (e.g. a deep link). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * In-screen header: round back button and a large left-aligned title.
 * Native headers are hidden app-wide so every screen shares this look.
 */
export function ScreenHeader({
  title,
  mode = 'back',
  right,
  onBack,
}: {
  title?: string;
  mode?: HeaderMode;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  // A modal may be an iOS page sheet (already below the status bar) or full
  // screen (Android, or iOS when the sheet expands), so let the native safe area
  // measure where it actually is instead of assuming.
  const Container = mode === 'modal' ? SafeAreaView : View;
  return (
    <Container
      // Additive: the measured inset plus the padding below.
      edges={{ top: 'additive' }}
      style={[
        styles.header,
        { paddingTop: mode === 'modal' ? spacing.lg : insets.top + spacing.sm },
      ]}>
      {mode !== 'root' && (
        <CircleButton
          icon={mode === 'modal' ? 'close' : 'chevron-back'}
          onPress={onBack ?? goBack}
        />
      )}
      {title !== undefined && (
        <RNText
          style={[styles.headerTitle, mode === 'root' && styles.headerTitleRoot]}
          numberOfLines={1}>
          {title}
        </RNText>
      )}
      <View style={styles.headerRight}>{right}</View>
    </Container>
  );
}

export function Screen({
  children,
  title,
  mode,
  headerRight,
  header = true,
  bottomSpace,
}: {
  children: ReactNode;
  title?: string;
  mode?: HeaderMode;
  headerRight?: ReactNode;
  /** Set false when the screen draws its own top area. */
  header?: boolean;
  /** Extra bottom padding, e.g. to clear the floating tab bar. */
  bottomSpace?: number;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  useScrollResetOnTabLeave(scrollRef);
  return (
    <View style={styles.screenRoot}>
      <Backdrop />
      {header && <ScreenHeader title={title} mode={mode} right={headerRight} />}
      {/* Edge-to-edge Android doesn't resize the window for the keyboard either, so
          shrink the list on both platforms and keep the focused field above it. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.screen,
            !header && { paddingTop: insets.top + spacing.sm },
            bottomSpace !== undefined && { paddingBottom: bottomSpace },
          ]}
          keyboardShouldPersistTaps="handled">
          {/* Rows animate in when added later, not all at once when the screen opens. */}
          <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
    <PressScale onPress={onPress} style={[styles.card, style]}>
      {children}
    </PressScale>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'destructive' | 'ghost' | 'light';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  trailingIcon,
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = BUTTON_FG[variant];
  return (
    <PressScale
      onPress={onPress}
      // Always a boolean: with `undefined` Android keeps a view that was once disabled
      // disabled, and only its text stays tappable.
      disabled={!!(disabled || loading)}
      scaleTo={0.95}
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: BUTTON_BG[variant] },
        disabled && styles.pressed,
        style,
      ]}>
      {loading ? (
        <Spinner color={fg} size={36} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
          <RNText style={[styles.buttonText, small && styles.buttonTextSmall, { color: fg }]}>
            {title}
          </RNText>
          {trailingIcon && <Ionicons name={trailingIcon} size={small ? 15 : 18} color={fg} />}
        </>
      )}
    </PressScale>
  );
}

const BUTTON_BG: Record<ButtonVariant, string> = {
  primary: colors.accent,
  secondary: colors.surface,
  danger: colors.surface,
  destructive: colors.danger,
  ghost: 'transparent',
  light: colors.text,
};
const BUTTON_FG: Record<ButtonVariant, string> = {
  primary: colors.accentText,
  secondary: colors.text,
  danger: colors.danger,
  destructive: colors.text,
  ghost: colors.accent,
  light: colors.background,
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
      disabled={!!disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, (pressed || disabled) && styles.dimmed]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Field({
  label,
  style,
  containerStyle,
  autoFocus,
  ...props
}: TextInputProps & {
  label?: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  const input = useDeferredFocus(autoFocus);
  return (
    <View style={[styles.field, containerStyle]}>
      {label && <Text variant="caption">{label}</Text>}
      <TextInput
        ref={input}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          props.multiline && styles.inputMultiline,
          focused && styles.inputFocused,
          style,
        ]}
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
    </View>
  );
}

export function SearchField(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput placeholderTextColor={colors.textMuted} style={styles.searchInput} {...props} />
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

/** Horizontally scrolling row of chips, edge to edge. */
export function ChipScroller({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroller}
      contentContainerStyle={styles.chipScrollerContent}>
      {children}
    </ScrollView>
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

/** Small rounded label, e.g. "ACTIVE" or "PR". */
export function Badge({
  label,
  tone = 'accent',
}: {
  label: string;
  tone?: 'accent' | 'muted' | 'warning';
}) {
  const color =
    tone === 'accent' ? colors.accent : tone === 'warning' ? colors.warning : colors.textSecondary;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <RNText style={[styles.badgeText, { color }]}>{label}</RNText>
    </View>
  );
}

/** Metric tile with an icon, value and caption, as on the home stats row. */
export function StatTile({
  icon,
  value,
  unit,
  label,
  style,
}: {
  icon: IconName;
  value: string;
  unit?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stat, style]}>
      <Ionicons name={icon} size={22} color={colors.accent} />
      <RNText style={styles.statValue} numberOfLines={1}>
        {value}
        {unit ? <RNText style={styles.statUnit}> {unit}</RNText> : null}
      </RNText>
      <Text variant="muted">{label}</Text>
    </View>
  );
}

/** Accent "01", "02"… marker for ordered sequences. */
export function IndexMarker({ n }: { n: number }) {
  return <RNText style={styles.indexMarker}>{String(n).padStart(2, '0')}</RNText>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading">{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: IconName;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <Text variant="body" style={styles.center}>
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
      <Spinner color={colors.accent} size={96} />
    </View>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.row, style]}>{children}</View>
);

const styles = StyleSheet.create({
  hero: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: '800',
    letterSpacing: -1,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heading: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  body: { color: colors.text, fontSize: fontSize.md, fontWeight: '500' },
  secondary: { color: colors.textSecondary, fontSize: fontSize.md },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  caption: { color: colors.textSecondary, fontSize: fontSize.sm },
  overline: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  flex: { flex: 1 },
  screenRoot: { flex: 1, backgroundColor: colors.background },
  screen: {
    padding: spacing.lg,
    gap: SCREEN_GAP,
    paddingBottom: spacing.xxl * 2,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg + 1,
    fontWeight: '700',
  },
  headerTitleRoot: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  // Always as tall as a CircleButton, so the header doesn't jump when the actions change.
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  circle: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.35 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: spacing.lg },
  buttonText: { fontSize: fontSize.md, fontWeight: '700' },
  buttonTextSmall: { fontSize: fontSize.sm },
  iconButton: { padding: spacing.xs },
  field: { gap: spacing.xs },
  inputFocused: { borderWidth: 1, borderColor: colors.accent },
  input: {
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    color: colors.text,
    fontSize: fontSize.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipScroller: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  chipScrollerContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  chipTextSelected: { color: colors.accentText },
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm / 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  statValue: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  statUnit: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  indexMarker: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '800',
    width: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  center: { textAlign: 'center' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
