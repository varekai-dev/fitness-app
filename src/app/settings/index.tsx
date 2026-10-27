import { Platform, StyleSheet, View } from 'react-native';

import { AppUpdateCard } from '@/components/app-update';
import { SettingsLink } from '@/components/settings';
import { Screen } from '@/components/ui';
import { readSeenLevels } from '@/db/achievements';
import { useAchievements } from '@/hooks/use-achievements';
import { useAccount } from '@/lib/account';
import { achievementTotals, newLevels } from '@/lib/achievements';
import { healthName } from '@/lib/health';
import { tr } from '@/lib/i18n';
import { useEnabledModules } from '@/lib/modules';
import { notificationsSupported } from '@/lib/notifications';

export default function SettingsScreen() {
  const enabled = useEnabledModules();
  const achievements = useAchievements();
  const user = useAccount();
  return (
    <Screen title={tr('Налаштування', 'Settings')}>
      <SettingsLink
        icon="person-circle-outline"
        title={tr('Акаунт', 'Account')}
        hint={user ? user.email : tr('Вхід, реєстрація', 'Sign in, sign up')}
        href="/settings/account"
      />
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
      <SettingsLink
        icon="ribbon-outline"
        title={tr('Підсумки', 'Recap')}
        hint={tr(
          'Місяць і рік у цифрах, щоб поділитися',
          'Your month and year in numbers, to share',
        )}
        href="/recap"
      />
      <SettingsLink
        icon="medal-outline"
        title={tr('Досягнення', 'Achievements')}
        hint={achievementsHint(achievements)}
        href="/achievements"
      />
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

function achievementsHint(list: ReturnType<typeof useAchievements>) {
  if (!list) return tr('Рівні за тренування, їжу й воду', 'Levels for training, food and water');
  const { unlocked, total } = achievementTotals(list);
  const fresh = newLevels(list, readSeenLevels());
  return fresh > 0
    ? `${tr('Нових', 'New')}: ${fresh} · ${unlocked} / ${total}`
    : `${unlocked} / ${total}`;
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
});
