import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

export function ExerciseThumb({ uri, size = 44 }: { uri: string | null; size?: number }) {
  const box = {
    width: size,
    height: size,
    borderRadius: size > 48 ? radius.md : radius.sm,
  };
  if (!uri) {
    return (
      <View style={[styles.placeholder, box]}>
        <Ionicons name="barbell" size={size * 0.45} color={colors.accent} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.image, box]} contentFit="cover" />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { backgroundColor: colors.surfaceRaised },
});
