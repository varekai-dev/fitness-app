import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { AppUpdateCard } from '@/components/app-update';
import { SettingsLink } from '@/components/settings';
import { Card, ChipGroup, Row, Screen, Text } from '@/components/ui';
import { healthName } from '@/lib/health';
import { languagePreference, setLanguage, tr, type LanguagePreference } from '@/lib/i18n';
import { notificationsSupported } from '@/lib/notifications';
import { colors } from '@/theme';

const LANGUAGE_OPTIONS = ['system', 'uk', 'en'] as const;
const LANGUAGE_LABELS: Record<LanguagePreference, string> = {
  system: tr('Як у системі', 'System'),
  // Each language is named in itself, so it can be found from either one.
  uk: 'Українська',
  en: 'English',
};

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
        hint={tr('Норма калорій', 'Calorie goal')}
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
      <Card>
        <Row>
          <Ionicons name="language-outline" size={20} color={colors.accent} />
          <Text variant="heading">{tr('Мова', 'Language')}</Text>
        </Row>
        <ChipGroup
          options={LANGUAGE_OPTIONS}
          value={languagePreference}
          onChange={(value) => {
            Haptics.selectionAsync();
            setLanguage(value);
          }}
          labels={LANGUAGE_LABELS}
        />
      </Card>
      {Platform.OS !== 'web' && <AppUpdateCard />}
    </Screen>
  );
}
