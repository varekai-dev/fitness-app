import { Platform, StyleSheet, View } from 'react-native';

import { AppUpdateCard } from '@/components/app-update';
import { SettingsLink } from '@/components/settings';
import { Screen } from '@/components/ui';
import { healthName } from '@/lib/health';
import { tr } from '@/lib/i18n';
import { notificationsSupported } from '@/lib/notifications';

export default function SettingsScreen() {
  return (
    <Screen title={tr('Налаштування', 'Settings')}>
      <SettingsLink
        icon="person-outline"
        title={tr('Профіль', 'Profile')}
        hint={tr('Вага, зріст, вік', 'Weight, height, age')}
        href="/profile"
      />
      <SettingsLink
        icon="restaurant-outline"
        title={tr('Харчування', 'Food')}
        hint={tr('Норма калорій, шаблони й підказки', 'Calorie goal, templates and suggestions')}
        href="/settings/food"
      />
      <SettingsLink
        icon="water-outline"
        title={tr('Вода', 'Water')}
        hint={tr('Денна ціль', 'Daily goal')}
        href="/settings/water"
      />
      {notificationsSupported && (
        <SettingsLink
          icon="notifications-outline"
          title={tr('Сповіщення', 'Notifications')}
          hint={tr('Вода, мій день', 'Water, my day')}
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
        hint={tr('Мова, одиниці', 'Language, units')}
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
