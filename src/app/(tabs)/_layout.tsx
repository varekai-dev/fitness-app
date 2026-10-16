import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/floating-tab-bar';
import type { IconName } from '@/components/ui';
import { tr } from '@/lib/i18n';
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
      <Tabs.Screen name="index" options={{ title: tr('Головна', 'Home') }} />
      <Tabs.Screen name="training" options={{ title: tr('Тренування', 'Training') }} />
      <Tabs.Screen name="food" options={{ title: tr('Харчування', 'Food') }} />
      <Tabs.Screen name="water" options={{ title: tr('Вода', 'Water') }} />
    </Tabs>
  );
}
