import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, radius } from '@/theme';

const ACTION_WIDTH = 72;

/**
 * Swiping the row left reveals a trash button. `onDelete` gets `close` to slide
 * the row back, e.g. when the user cancels the confirmation.
 */
export function SwipeToDelete({
  children,
  onDelete,
}: {
  children: ReactNode;
  onDelete: (close: () => void) => void;
}) {
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      renderRightActions={(progress, _translation, swipeable: SwipeableMethods) => (
        <DeleteAction progress={progress} onPress={() => onDelete(swipeable.close)} />
      )}>
      {children}
    </ReanimatedSwipeable>
  );
}

function DeleteAction({
  progress,
  onPress,
}: {
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.6, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={styles.action}>
      <Animated.View style={style}>
        <Pressable
          onPress={onPress}
          hitSlop={8}
          style={({ pressed }) => [styles.trash, pressed && styles.pressed]}>
          <Ionicons name="trash-outline" size={22} color={colors.text} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { width: ACTION_WIDTH, alignItems: 'flex-end', justifyContent: 'center' },
  trash: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
