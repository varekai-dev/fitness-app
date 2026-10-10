import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Text, type IconName } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export type DialogButton = {
  text: string;
  /** `cancel` dims the button; `destructive` paints it red. */
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type DialogOptions = {
  title: string;
  message?: string;
  /** Defaults to a single "OK". */
  buttons?: DialogButton[];
  icon?: IconName;
};

/**
 * In-app replacement for `Alert.alert`, drawn in the app's own style.
 * Render `element` anywhere in the screen and call `show`. A button's `onPress`
 * runs only once the dialog has fully closed, so it can navigate away or open
 * another dialog without fighting the closing animation.
 */
export function useDialog() {
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [visible, setVisible] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const show = useCallback((next: DialogOptions) => {
    setOptions(next);
    setVisible(true);
  }, []);

  const close = (action?: () => void) => {
    pending.current = action ?? null;
    setVisible(false);
  };

  const onDismiss = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };

  const buttons = options?.buttons ?? [{ text: 'OK' }];
  const cancel = buttons.find((b) => b.style === 'cancel');
  const destructive = buttons.some((b) => b.style === 'destructive');
  const icon = options?.icon ?? (destructive ? 'trash-outline' : undefined);

  const element = (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close(cancel?.onPress)}
      onDismiss={onDismiss}>
      <View style={styles.backdrop}>
        {/* Tapping outside acts as cancel, when there is one. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          disabled={!cancel}
          onPress={() => close(cancel?.onPress)}
        />
        {options && (
          <View style={styles.card}>
            {icon && (
              <View style={[styles.icon, destructive && styles.iconDanger]}>
                <Ionicons
                  name={icon}
                  size={26}
                  color={destructive ? colors.danger : colors.accent}
                />
              </View>
            )}
            <Text variant="heading" style={styles.center}>
              {options.title}
            </Text>
            {options.message ? (
              <Text variant="secondary" style={styles.center}>
                {options.message}
              </Text>
            ) : null}
            <View style={[styles.buttons, buttons.length === 2 && styles.buttonsRow]}>
              {orderButtons(buttons).map((b) => (
                <Button
                  key={b.text}
                  title={b.text}
                  variant={
                    b.style === 'cancel'
                      ? 'secondary'
                      : b.style === 'destructive'
                        ? 'destructive'
                        : 'primary'
                  }
                  style={[
                    buttons.length === 2 && styles.flex,
                    b.style === 'cancel' && styles.cancel,
                  ]}
                  onPress={() => close(b.onPress)}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );

  return { show, element };
}

/** Side by side, cancel goes left; stacked, it goes last. */
function orderButtons(buttons: DialogButton[]) {
  const cancel = buttons.filter((b) => b.style === 'cancel');
  const rest = buttons.filter((b) => b.style !== 'cancel');
  return buttons.length === 2 ? [...cancel, ...rest] : [...rest, ...cancel];
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg + 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconDanger: { backgroundColor: 'rgba(255, 90, 90, 0.14)' },
  center: { textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  buttonsRow: { flexDirection: 'row' },
  flex: { flex: 1, paddingHorizontal: spacing.md },
  // The card is already `surface`, so lift the cancel button off it.
  cancel: { backgroundColor: colors.surfaceRaised },
});
