import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/floating-tab-bar';
import type { IconName } from '@/components/ui';
import { MODULE_INFO, MODULES, useEnabledModules, useModuleOrder } from '@/lib/modules';
import { colors } from '@/theme';

const ICONS: Record<string, IconName> = Object.fromEntries(
  MODULES.map((m) => [MODULE_INFO[m].route, MODULE_INFO[m].icon]),
);

export default function TabsLayout() {
  // Switched-off sections leave the tab bar; opening one by link lands on the first tab left.
  const enabled = useEnabledModules();
  // Tabs follow the order the screens are declared in.
  const order = useModuleOrder();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} icons={ICONS} />}
      screenOptions={{
        headerShown: false,
        // Screens slide toward the tapped tab, the same way the bar's bubble moves.
        animation: 'shift',
        sceneStyle: { backgroundColor: colors.background },
      }}>
      {order.map((m) => (
        <Tabs.Protected key={m} guard={enabled.includes(m)}>
          <Tabs.Screen name={MODULE_INFO[m].route} options={{ title: MODULE_INFO[m].title }} />
        </Tabs.Protected>
      ))}
    </Tabs>
  );
}
