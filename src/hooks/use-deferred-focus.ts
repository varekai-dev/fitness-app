import { useEffect, useRef } from 'react';
import type { TextInput } from 'react-native';

/**
 * Focuses a text field shortly after it mounts, in place of `autoFocus`.
 *
 * On Android a field with `autoFocus` focuses while its screen is still being
 * attached during the navigation transition, and React Native's search for the
 * next focusable field (run to set up the keyboard) crashes the app natively in
 * `FabricUIManager.findNextFocusableElement`. Waiting until the screen is in
 * place avoids it.
 */
export function useDeferredFocus(enabled: boolean | undefined) {
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => ref.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, [enabled]);

  return ref;
}
