import { SettingsLink } from '@/components/settings';
import { Screen } from '@/components/ui';
import { notificationsSupported } from '@/lib/notifications';

export default function SettingsScreen() {
  return (
    <Screen title="Налаштування">
      <SettingsLink icon="person-outline" title="Профіль" hint="Вага, зріст, вік" href="/profile" />
      <SettingsLink
        icon="restaurant-outline"
        title="Харчування"
        hint="Норма калорій"
        href="/settings/food"
      />
      <SettingsLink icon="water-outline" title="Вода" hint="Денна ціль" href="/settings/water" />
      {notificationsSupported && (
        <SettingsLink
          icon="notifications-outline"
          title="Сповіщення"
          hint="Вода, мій день"
          href="/settings/notifications"
        />
      )}
      <SettingsLink
        icon="key-outline"
        title="Інтеграції"
        hint="Groq AI"
        href="/settings/integrations"
      />
    </Screen>
  );
}
