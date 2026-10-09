import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/floating-tab-bar';
import type { IconName } from '@/components/ui';
import { colors } from '@/theme';

const ICONS: Record<string, IconName> = {
  index: 'home',
  programs: 'calendar',
  exercises: 'barbell',
  history: 'stats-chart',
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
      <Tabs.Screen name="programs" options={{ title: 'Програми' }} />
      <Tabs.Screen name="exercises" options={{ title: 'Вправи' }} />
      <Tabs.Screen name="history" options={{ title: 'Історія' }} />
    </Tabs>
  );
}
