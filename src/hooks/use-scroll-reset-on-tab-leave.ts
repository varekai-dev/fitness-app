import { useNavigation } from 'expo-router';
import { useEffect, type RefObject } from 'react';

type Scrollable = {
  scrollTo?: (options: { y: number; animated: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated: boolean }) => void;
};

/**
 * Scrolls back to the top when the user switches to another tab, so a tab
 * always opens from its start instead of where it was left.
 *
 * Opening a screen on top of the tabs blurs the tab too, but there the tab
 * navigator itself loses focus, so the position is kept for coming back.
 * Does nothing outside a tab navigator.
 */
export function useScrollResetOnTabLeave(ref: RefObject<Scrollable | null>) {
  const navigation = useNavigation();

  useEffect(
    () =>
      navigation.addListener('blur', () => {
        if (navigation.getState()?.type !== 'tab') return;
        if (navigation.getParent()?.isFocused() === false) return;
        const list = ref.current;
        if (list?.scrollToOffset) list.scrollToOffset({ offset: 0, animated: false });
        else list?.scrollTo?.({ y: 0, animated: false });
      }),
    [navigation, ref],
  );
}
