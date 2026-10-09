import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui';
import { colors, radius } from '@/theme';

function tabIcon(name: IconName) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return (
      <View style={[styles.icon, focused && styles.iconFocused]}>
        <Ionicons
          name={focused ? name : (`${name}-outline` as IconName)}
          size={20}
          color={focused ? colors.accentText : colors.textSecondary}
        />
      </View>
    );
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [styles.bar, { height: 64 + insets.bottom, paddingBottom: insets.bottom }],
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Головна', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen
        name="programs"
        options={{ title: 'Програми', tabBarIcon: tabIcon('calendar') }}
      />
      <Tabs.Screen name="exercises" options={{ title: 'Вправи', tabBarIcon: tabIcon('barbell') }} />
      <Tabs.Screen
        name="history"
        options={{ title: 'Історія', tabBarIcon: tabIcon('stats-chart') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    paddingTop: 10,
  },
  item: { alignItems: 'center', justifyContent: 'center' },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFocused: { backgroundColor: colors.accent },
});
