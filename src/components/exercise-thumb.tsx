import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

export function ExerciseThumb({ uri, size = 44 }: { uri: string | null; size?: number }) {
  const box = { width: size, height: size };
  if (!uri) {
    return (
      <View style={[styles.placeholder, box]}>
        <Ionicons name="barbell-outline" size={size / 2} color={colors.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.image, box]} contentFit="cover" />;
}

const styles = StyleSheet.create({
  placeholder: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
});
