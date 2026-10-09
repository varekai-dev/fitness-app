import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import type { IconName } from '@/components/ui';
import { colors } from '@/theme';

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Головна', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="programs" options={{ title: 'Програми', tabBarIcon: tabIcon('list') }} />
      <Tabs.Screen name="exercises" options={{ title: 'Вправи', tabBarIcon: tabIcon('barbell') }} />
      <Tabs.Screen name="history" options={{ title: 'Історія', tabBarIcon: tabIcon('time') }} />
    </Tabs>
  );
}
