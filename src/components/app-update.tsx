import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';

import { Button, Card, Row, Text } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { colors } from '@/theme';

/** Over-the-air updates only work in release builds, not in Expo Go or a dev server. */
const updatesAvailable = Updates.isEnabled && !__DEV__;

/**
 * App version with a button to install a newer JS bundle published with `eas update`.
 * Updates are never downloaded on their own (`checkAutomatically: NEVER`), only from here.
 */
export function AppUpdateCard() {
  const {
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
    checkError,
    downloadError,
  } = Updates.useUpdates();

  useEffect(() => {
    if (updatesAvailable) Updates.checkForUpdateAsync().catch(() => {});
  }, []);

  const install = async () => {
    Haptics.selectionAsync();
    try {
      if (!isUpdatePending) await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      // Shown through downloadError.
    }
  };

  const status = !updatesAvailable
    ? tr('Оновлення працюють лише в зібраному застосунку', 'Updates work only in a built app')
    : isChecking
      ? tr('Перевіряю оновлення…', 'Checking for updates…')
      : checkError
        ? tr('Не вдалося перевірити оновлення', 'Couldn’t check for updates')
        : downloadError
          ? tr('Не вдалося завантажити оновлення', 'Couldn’t download the update')
          : isUpdateAvailable || isUpdatePending
            ? tr('Доступна нова версія', 'A new version is available')
            : tr('У тебе остання версія', 'You’re on the latest version');

  return (
    <Card>
      <Row>
        <Ionicons name="cloud-download-outline" size={20} color={colors.accent} />
        <Text variant="heading">
          {tr('Версія', 'Version')} {Constants.expoConfig?.version}
        </Text>
      </Row>
      <Text variant="muted">{status}</Text>
      {updatesAvailable &&
        (isUpdateAvailable || isUpdatePending ? (
          <Button
            title={tr('Оновити', 'Update')}
            icon="refresh"
            small
            loading={isDownloading}
            onPress={install}
          />
        ) : (
          <Button
            title={tr('Перевірити', 'Check')}
            variant="secondary"
            small
            loading={isChecking}
            onPress={() => Updates.checkForUpdateAsync().catch(() => {})}
          />
        ))}
    </Card>
  );
}
