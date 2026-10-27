import type { RefObject } from 'react';
import type { TextInput } from 'react-native';

/**
 * Selects a field's text once as it gains focus, in place of `selectTextOnFocus`.
 *
 * On Android `selectTextOnFocus` can select the whole text again while it's
 * typed into (e.g. after the dot of "1.2"), so the next digit wipes what was
 * there. Call it from `onFocus` with the field's current text.
 */
export function selectOnFocus(input: RefObject<TextInput | null>, text: string | undefined) {
  if (!text) return;
  // After the tap that focused the field has placed its cursor.
  setTimeout(() => input.current?.setSelection(0, text.length), 50);
}
