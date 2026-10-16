import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';

import { Button, Card, Row, Text } from '@/components/ui';
import { colors } from '@/theme';

/** Over-the-air updates only work in release builds, not in Expo Go or a dev server. */
const updatesAvailable = Updates.isEnabled && !__DEV__;

/**
 * App version with a button to install a newer JS bundle published with `eas update`.
 * Updates are never downloaded on their own (`checkAutomatically: NEVER`), only from here.
 */
export function AppUpdateCard() {
  const { isChecking, isDownloading, isUpdateAvailable, isUpdatePending, checkError, downloadError } =
    Updates.useUpdates();

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
    ? 'Оновлення працюють лише в зібраному застосунку'
    : isChecking
      ? 'Перевіряю оновлення…'
      : checkError
        ? 'Не вдалося перевірити оновлення'
        : downloadError
          ? 'Не вдалося завантажити оновлення'
          : isUpdateAvailable || isUpdatePending
            ? 'Доступна нова версія'
            : 'У тебе остання версія';

  return (
    <Card>
      <Row>
        <Ionicons name="cloud-download-outline" size={20} color={colors.accent} />
        <Text variant="heading">Версія {Constants.expoConfig?.version}</Text>
      </Row>
      <Text variant="muted">{status}</Text>
      {updatesAvailable &&
        (isUpdateAvailable || isUpdatePending ? (
          <Button title="Оновити" icon="refresh" small loading={isDownloading} onPress={install} />
        ) : (
          <Button
            title="Перевірити"
            variant="secondary"
            small
            loading={isChecking}
            onPress={() => Updates.checkForUpdateAsync().catch(() => {})}
          />
        ))}
    </Card>
  );
}
