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
import { colors, spacing } from '@/theme';

const syncedFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const STORE_HINT =
  healthName === 'Apple Health'
    ? 'Перевір доступ у застосунку Здоров’я: Профіль → Застосунки → Fitness.'
    : 'Дозволь читання для Fitness у налаштуваннях Health Connect.';

function resultMessage(result: HealthSyncResult) {
  switch (result.status) {
    case 'ok':
      return result.weights + result.activities > 0
        ? {
            title: 'Синхронізовано',
            message: `Днів з вагою: ${result.weights}. Нових активностей: ${result.activities}.`,
          }
        : { title: 'Нових даних немає', message: `Усе з ${healthName} уже тут. ${STORE_HINT}` };
    case 'denied':
      return { title: 'Немає доступу', message: STORE_HINT };
    case 'update-required':
      return {
        title: 'Потрібне оновлення',
        message: `Онови ${healthName} у Google Play і спробуй ще раз.`,
      };
    case 'unavailable':
      return {
        title: `${healthName} недоступний`,
        message:
          healthName === 'Apple Health'
            ? 'Цей пристрій не підтримує Apple Health.'
            : 'Встанови Health Connect з Google Play.',
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
      if (result.status === 'ok') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dialog.show(resultMessage(result));
    } catch (e) {
      dialog.show({ title: 'Не вдалося синхронізувати', message: String(e), icon: 'alert-circle' });
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = () =>
    dialog.show({
      title: `Відключити ${healthName}?`,
      message: 'Вага та активності більше не підтягуватимуться. Уже імпортовані записи залишаться.',
      buttons: [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Відключити', style: 'destructive', onPress: () => disconnectHealth() },
      ],
    });

  return (
    <Card>
      <Row>
        <Ionicons name="heart-outline" size={20} color={colors.accent} />
        <Text variant="heading">{healthName}</Text>
      </Row>
      <Text variant="muted">
        Підтягує вагу з розумних ваг, а прогулянки, біг та інші тренування з годинника — в історію
        тренувань. Оновлюється щоразу, коли відкриваєш застосунок.
      </Text>
      {!healthSupported ? (
        <Text variant="caption">Працює лише в зібраному застосунку, не в Expo Go.</Text>
      ) : data?.connected ? (
        <>
          <Row style={styles.status}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <View style={styles.flex}>
              <Text variant="body">Підключено</Text>
              {data.syncedAt && (
                <Text variant="caption">
                  Остання синхронізація: {syncedFormatter.format(data.syncedAt)}
                </Text>
              )}
            </View>
            <Button title="Відключити" variant="danger" small onPress={disconnect} />
          </Row>
          <Button
            title="Синхронізувати зараз"
            icon="sync"
            variant="secondary"
            loading={syncing}
            onPress={sync}
          />
        </>
      ) : data ? (
        <Button title={`Підключити ${healthName}`} icon="link" loading={syncing} onPress={sync} />
      ) : null}
      {dialog.element}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  status: { marginVertical: spacing.xs },
});
