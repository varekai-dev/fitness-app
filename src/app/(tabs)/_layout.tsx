import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/floating-tab-bar';
import type { IconName } from '@/components/ui';
import { colors } from '@/theme';

const ICONS: Record<string, IconName> = {
  index: 'home',
  training: 'barbell',
  food: 'restaurant',
  water: 'water',
};

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} icons={ICONS} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Головна' }} />
      <Tabs.Screen name="training" options={{ title: 'Тренування' }} />
      <Tabs.Screen name="food" options={{ title: 'Харчування' }} />
      <Tabs.Screen name="water" options={{ title: 'Вода' }} />
    </Tabs>
  );
}
