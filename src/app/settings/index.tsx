import { t } from '@lingui/core/macro';
import { Platform, StyleSheet, View } from 'react-native';

import { AppUpdateCard } from '@/components/app-update';
import { SettingsLink } from '@/components/settings';
import { Screen } from '@/components/ui';
import { readSeenLevels } from '@/db/achievements';
import { useAchievements } from '@/hooks/use-achievements';
import { useAccount } from '@/lib/account';
import { achievementTotals, newLevels } from '@/lib/achievements';
import { healthName } from '@/lib/health';
import { openPrivacyPolicy } from '@/lib/legal';
import { useEnabledModules } from '@/lib/modules';
import { notificationsSupported } from '@/lib/notifications';

export default function SettingsScreen() {
  const enabled = useEnabledModules();
  const achievements = useAchievements();
  const user = useAccount();
  return (
    <Screen title={t`Налаштування`}>
      <SettingsLink
        icon="person-circle-outline"
        title={t`Акаунт`}
        hint={user ? user.email : t`Вхід, реєстрація`}
        href="/settings/account"
      />
      <SettingsLink
        icon="person-outline"
        title={t`Профіль`}
        hint={t`Вага, зріст, вік`}
        href="/profile"
      />
      {enabled.includes('food') && (
        <SettingsLink
          icon="restaurant-outline"
          title={t`Харчування`}
          hint={t`Норма калорій, шаблони, підказки й AI`}
          href="/settings/food"
        />
      )}
      {enabled.includes('water') && (
        <SettingsLink
          icon="water-outline"
          title={t`Вода`}
          hint={t`Денна ціль`}
          href="/settings/water"
        />
      )}
      <SettingsLink
        icon="ribbon-outline"
        title={t`Підсумки`}
        hint={t`Місяць і рік у цифрах, щоб поділитися`}
        href="/recap"
      />
      <SettingsLink
        icon="medal-outline"
        title={t`Досягнення`}
        hint={achievementsHint(achievements)}
        href="/achievements"
      />
      {notificationsSupported && (
        <SettingsLink
          icon="notifications-outline"
          title={t`Сповіщення`}
          hint={
            enabled.includes('water')
              ? t`Вода, мій день`
              : t`Мій день, фото`
          }
          href="/settings/notifications"
        />
      )}
      {Platform.OS !== 'web' && (
        <SettingsLink
          icon="link-outline"
          title={t`Інтеграції`}
          hint={healthName}
          href="/settings/integrations"
        />
      )}
      <SettingsLink
        icon="options-outline"
        title={t`Застосунок`}
        hint={t`Мова, одиниці, розділи`}
        href="/settings/app"
      />
      {Platform.OS !== 'web' && (
        <SettingsLink
          icon="cloud-upload-outline"
          title={t`Резервна копія`}
          hint={t`Сервер, експорт, імпорт`}
          href="/settings/backup"
        />
      )}
      <SettingsLink
        icon="shield-checkmark-outline"
        title={t`Конфіденційність`}
        hint={t`Які дані й куди`}
        onPress={openPrivacyPolicy}
      />
      {/* Fills the rest of the screen so the version sits at the bottom. */}
      <View style={styles.spacer} />
      {Platform.OS !== 'web' && <AppUpdateCard />}
    </Screen>
  );
}

function achievementsHint(list: ReturnType<typeof useAchievements>) {
  if (!list) return t`Рівні за тренування, їжу й воду`;
  const { unlocked, total } = achievementTotals(list);
  const fresh = newLevels(list, readSeenLevels());
  return fresh > 0
    ? `${t`Нових`}: ${fresh} · ${unlocked} / ${total}`
    : `${unlocked} / ${total}`;
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
});
