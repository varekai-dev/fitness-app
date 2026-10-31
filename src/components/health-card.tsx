import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Row, Text } from '@/components/ui';
import { getHealthSettings } from '@/db/health';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import {
  disconnectHealth,
  healthName,
  healthSupported,
  isHealthConnected,
  syncHealth,
  type HealthSyncResult,
} from '@/lib/health';
import { locale } from '@/lib/i18n';
import { colors, spacing } from '@/theme';

const syncedFormatter = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const STORE_HINT =
  healthName === 'Apple Health'
    ? t`Перевір доступ у застосунку Здоров’я: Профіль → Застосунки → GetFit.`
    : t`Дозволь читання для GetFit у налаштуваннях Health Connect.`;

function resultMessage(result: HealthSyncResult) {
  switch (result.status) {
    case 'ok':
      return result.weights > 0
        ? {
            title: t`Синхронізовано`,
            message: t`Днів з вагою: ${result.weights}.`,
          }
        : {
            title: t`Нових даних немає`,
            message: t`Усе з ${healthName} уже тут. ${STORE_HINT}`,
          };
    case 'denied':
      return { title: t`Немає доступу`, message: STORE_HINT };
    case 'update-required':
      return {
        title: t`Потрібне оновлення`,
        message: t`Онови ${healthName} у Google Play і спробуй ще раз.`,
      };
    case 'unavailable':
      return {
        title: t`${healthName} недоступний`,
        message:
          healthName === 'Apple Health'
            ? t`Цей пристрій не підтримує Apple Health.`
            : t`Встанови Health Connect з Google Play.`,
      };
  }
}

async function loadHealth() {
  const [settings, connected] = await Promise.all([getHealthSettings(), isHealthConnected()]);
  return { ...settings, connected };
}

/** Connects Apple Health or Health Connect: weight syncs from there. */
export function HealthCard() {
  const { data } = useFocusedDbQuery(loadHealth);
  const [syncing, setSyncing] = useState(false);
  const dialog = useDialog();

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await syncHealth({ prompt: true });
      dialog.show(resultMessage(result));
    } catch (e) {
      dialog.show({
        title: t`Не вдалося синхронізувати`,
        message: String(e),
        icon: 'alert-circle',
      });
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = () =>
    dialog.show({
      title: t`Відключити ${healthName}?`,
      message: t`Вага більше не підтягуватиметься. Уже імпортовані записи залишаться.`,
      buttons: [
        { text: t`Скасувати`, style: 'cancel' },
        {
          text: t`Відключити`,
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
        {t`Підтягує вагу з розумних ваг у журнал ваги. Оновлюється щоразу, коли відкриваєш застосунок.`}
      </Text>
      {!healthSupported ? (
        <Text variant="caption">
          {t`Працює лише в зібраному застосунку, не в Expo Go.`}
        </Text>
      ) : data?.connected ? (
        <>
          <Row style={styles.status}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <View style={styles.flex}>
              <Text variant="body">{t`Підключено`}</Text>
              {data.syncedAt && (
                <Text variant="caption">
                  {t`Остання синхронізація`}:{' '}
                  {syncedFormatter.format(data.syncedAt)}
                </Text>
              )}
            </View>
            <Button
              title={t`Відключити`}
              variant="danger"
              small
              onPress={disconnect}
            />
          </Row>
          <Button
            title={t`Синхронізувати зараз`}
            icon="sync"
            variant="secondary"
            loading={syncing}
            onPress={sync}
          />
        </>
      ) : data ? (
        <Button
          title={t`Підключити ${healthName}`}
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
