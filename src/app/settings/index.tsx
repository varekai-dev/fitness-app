import { Platform, StyleSheet, View } from 'react-native';

import { AppUpdateCard } from '@/components/app-update';
import { SettingsLink } from '@/components/settings';
import { Screen } from '@/components/ui';
import { healthName } from '@/lib/health';
import { tr } from '@/lib/i18n';
import { useEnabledModules } from '@/lib/modules';
import { notificationsSupported } from '@/lib/notifications';

export default function SettingsScreen() {
  const enabled = useEnabledModules();
  return (
    <Screen title={tr('Налаштування', 'Settings')}>
      <SettingsLink
        icon="person-outline"
        title={tr('Профіль', 'Profile')}
        hint={tr('Вага, зріст, вік', 'Weight, height, age')}
        href="/profile"
      />
      {enabled.includes('food') && (
        <SettingsLink
          icon="restaurant-outline"
          title={tr('Харчування', 'Food')}
          hint={tr(
            'Норма калорій, шаблони, підказки й AI',
            'Calorie goal, templates, suggestions and AI',
          )}
          href="/settings/food"
        />
      )}
      {enabled.includes('water') && (
        <SettingsLink
          icon="water-outline"
          title={tr('Вода', 'Water')}
          hint={tr('Денна ціль', 'Daily goal')}
          href="/settings/water"
        />
      )}
      {notificationsSupported && (
        <SettingsLink
          icon="notifications-outline"
          title={tr('Сповіщення', 'Notifications')}
          hint={
            enabled.includes('water')
              ? tr('Вода, мій день', 'Water, my day')
              : tr('Мій день, фото', 'My day, photos')
          }
          href="/settings/notifications"
        />
      )}
      <SettingsLink
        icon="link-outline"
        title={tr('Інтеграції', 'Integrations')}
        hint={Platform.OS === 'web' ? 'Groq AI' : `${healthName}, Groq AI`}
        href="/settings/integrations"
      />
      <SettingsLink
        icon="options-outline"
        title={tr('Застосунок', 'App')}
        hint={tr('Мова, одиниці, розділи', 'Language, units, sections')}
        href="/settings/app"
      />
      {Platform.OS !== 'web' && (
        <SettingsLink
          icon="cloud-upload-outline"
          title={tr('Резервна копія', 'Backup')}
          hint={tr('Експорт, імпорт', 'Export, import')}
          href="/settings/backup"
        />
      )}
      {/* Fills the rest of the screen so the version sits at the bottom. */}
      <View style={styles.spacer} />
      {Platform.OS !== 'web' && <AppUpdateCard />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
});
