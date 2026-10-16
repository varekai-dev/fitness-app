import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Row, Text } from '@/components/ui';
import { getHealthSettings } from '@/db/health';
import { useDbQuery } from '@/hooks/use-db-query';
import {
  disconnectHealth,
  healthName,
  healthSupported,
  isHealthConnected,
  syncHealth,
  type HealthSyncResult,
} from '@/lib/health';
import { locale, tr } from '@/lib/i18n';
import { colors, spacing } from '@/theme';

const syncedFormatter = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const STORE_HINT =
  healthName === 'Apple Health'
    ? tr(
        'Перевір доступ у застосунку Здоров’я: Профіль → Застосунки → Fitness.',
        'Check access in the Health app: Profile → Apps → Fitness.',
      )
    : tr(
        'Дозволь читання для Fitness у налаштуваннях Health Connect.',
        'Allow Fitness to read data in Health Connect settings.',
      );

function resultMessage(result: HealthSyncResult) {
  switch (result.status) {
    case 'ok':
      return result.weights + result.activities > 0
        ? {
            title: tr('Синхронізовано', 'Synced'),
            message: tr(
              `Днів з вагою: ${result.weights}. Нових активностей: ${result.activities}.`,
              `Days with weight: ${result.weights}. New activities: ${result.activities}.`,
            ),
          }
        : {
            title: tr('Нових даних немає', 'No new data'),
            message: tr(
              `Усе з ${healthName} уже тут. ${STORE_HINT}`,
              `Everything from ${healthName} is already here. ${STORE_HINT}`,
            ),
          };
    case 'denied':
      return { title: tr('Немає доступу', 'No access'), message: STORE_HINT };
    case 'update-required':
      return {
        title: tr('Потрібне оновлення', 'Update required'),
        message: tr(
          `Онови ${healthName} у Google Play і спробуй ще раз.`,
          `Update ${healthName} in Google Play and try again.`,
        ),
      };
    case 'unavailable':
      return {
        title: tr(`${healthName} недоступний`, `${healthName} unavailable`),
        message:
          healthName === 'Apple Health'
            ? tr(
                'Цей пристрій не підтримує Apple Health.',
                'This device doesn’t support Apple Health.',
              )
            : tr(
                'Встанови Health Connect з Google Play.',
                'Install Health Connect from Google Play.',
              ),
      };
  }
}

async function loadHealth() {
  const [settings, connected] = await Promise.all([getHealthSettings(), isHealthConnected()]);
  return { ...settings, connected };
}

/** Connects Apple Health or Health Connect: weight and activities sync from there. */
export function HealthCard() {
  const { data } = useDbQuery(loadHealth);
  const [syncing, setSyncing] = useState(false);
  const dialog = useDialog();

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await syncHealth({ prompt: true });
      if (result.status === 'ok')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dialog.show(resultMessage(result));
    } catch (e) {
      dialog.show({
        title: tr('Не вдалося синхронізувати', 'Sync failed'),
        message: String(e),
        icon: 'alert-circle',
      });
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = () =>
    dialog.show({
      title: tr(`Відключити ${healthName}?`, `Disconnect ${healthName}?`),
      message: tr(
        'Вага та активності більше не підтягуватимуться. Уже імпортовані записи залишаться.',
        'Weight and activities will no longer sync. Records already imported will stay.',
      ),
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        {
          text: tr('Відключити', 'Disconnect'),
          style: 'destructive',
          onPress: () => disconnectHealth(),
        },
      ],
    });

  return (
    <Card>
      <Row>
        <Ionicons name="heart-outline" size={20} color={colors.accent} />
        <Text variant="heading">{healthName}</Text>
      </Row>
      <Text variant="muted">
        {tr(
          'Підтягує вагу з розумних ваг, а прогулянки, біг та інші тренування з годинника — в історію тренувань. Оновлюється щоразу, коли відкриваєш застосунок.',
          'Brings in weight from smart scales, and walks, runs and other workouts from your watch into the workout history. Updates every time you open the app.',
        )}
      </Text>
      {!healthSupported ? (
        <Text variant="caption">
          {tr(
            'Працює лише в зібраному застосунку, не в Expo Go.',
            'Works only in a built app, not in Expo Go.',
          )}
        </Text>
      ) : data?.connected ? (
        <>
          <Row style={styles.status}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <View style={styles.flex}>
              <Text variant="body">{tr('Підключено', 'Connected')}</Text>
              {data.syncedAt && (
                <Text variant="caption">
                  {tr('Остання синхронізація', 'Last sync')}:{' '}
                  {syncedFormatter.format(data.syncedAt)}
                </Text>
              )}
            </View>
            <Button
              title={tr('Відключити', 'Disconnect')}
              variant="danger"
              small
              onPress={disconnect}
            />
          </Row>
          <Button
            title={tr('Синхронізувати зараз', 'Sync now')}
            icon="sync"
            variant="secondary"
            loading={syncing}
            onPress={sync}
          />
        </>
      ) : data ? (
        <Button
          title={tr(`Підключити ${healthName}`, `Connect ${healthName}`)}
          icon="link"
          loading={syncing}
          onPress={sync}
        />
      ) : null}
      {dialog.element}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  status: { marginVertical: spacing.xs },
});
