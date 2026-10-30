import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Row, Screen, Text } from '@/components/ui';
import { reloadApp } from '@/lib/app-settings';
import {
  BackupError,
  discardBackup,
  exportBackup,
  pickBackup,
  restoreBackup,
  type PendingBackup,
} from '@/lib/backup';
import { locale } from '@/lib/i18n';
import {
  downloadServerBackup,
  listServerBackups,
  ServerBackupError,
  uploadBackup,
  type ServerBackup,
} from '@/lib/server-backup';
import { colors, spacing } from '@/theme';

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} ${t`КБ`}`
    : `${(bytes / 1024 / 1024).toFixed(1)} ${t`МБ`}`;

/** Export all data to a file and restore it, e.g. on a new phone. */
export default function BackupSettingsScreen() {
  const dialog = useDialog();
  const [busy, setBusy] = useState<'export' | 'import' | 'upload' | 'download' | null>(null);
  // undefined while loading, null when the list couldn't be loaded.
  const [serverBackups, setServerBackups] = useState<ServerBackup[] | null>();

  const fail = (title: string, e: unknown) =>
    dialog.show({
      title,
      message: e instanceof BackupError || e instanceof ServerBackupError ? e.message : String(e),
      icon: 'alert-circle',
    });

  const loadServerBackups = useCallback(
    () =>
      listServerBackups()
        .then(setServerBackups)
        .catch(() => setServerBackups(null)),
    [],
  );
  useEffect(() => {
    loadServerBackups();
  }, [loadServerBackups]);

  const startUpload = async () => {
    setBusy('upload');
    try {
      await uploadBackup();
      await loadServerBackups();
    } catch (e) {
      fail(t`Не вдалося зберегти копію`, e);
    } finally {
      setBusy(null);
    }
  };

  const startDownload = async (backup: ServerBackup) => {
    setBusy('download');
    let pending: PendingBackup;
    try {
      pending = await downloadServerBackup(backup.id);
    } catch (e) {
      fail(t`Не вдалося завантажити копію`, e);
      return;
    } finally {
      setBusy(null);
    }
    confirmRestore(pending);
  };

  const startExport = async () => {
    setBusy('export');
    try {
      await exportBackup();
    } catch (e) {
      fail(t`Не вдалося створити копію`, e);
    } finally {
      setBusy(null);
    }
  };

  const restore = async (pending: PendingBackup) => {
    setBusy('import');
    try {
      await restoreBackup(pending);
      await reloadApp('Backup restored');
    } catch (e) {
      setBusy(null);
      fail(t`Не вдалося відновити дані`, e);
    }
  };

  const startImport = async () => {
    setBusy('import');
    let pending: PendingBackup | null;
    try {
      pending = await pickBackup();
    } catch (e) {
      fail(t`Не вдалося відкрити файл`, e);
      return;
    } finally {
      setBusy(null);
    }
    if (pending) confirmRestore(pending);
  };

  const confirmRestore = (pending: PendingBackup) => {
    const s = pending.summary;
    const lines = [
      t`Копія від ${new Date(s.exportedAt).toLocaleString(locale)}` +
        (s.appVersion ? ` (v${s.appVersion})` : '') +
        ':',
      `${t`тренувань`}: ${s.workouts}`,
      `${t`записів їжі`}: ${s.foodEntries}`,
      `${t`зважувань`}: ${s.bodyWeights}`,
      `${t`фото прогресу`}: ${s.photos}`,
      `${t`фото вправ`}: ${s.exerciseImages}`,
      '',
      t`Усі поточні дані на цьому телефоні буде замінено. Це не можна скасувати.`,
    ];
    dialog.show({
      title: t`Замінити всі дані?`,
      message: lines.join('\n'),
      icon: 'warning-outline',
      buttons: [
        { text: t`Скасувати`, style: 'cancel', onPress: () => discardBackup(pending) },
        { text: t`Замінити`, style: 'destructive', onPress: () => restore(pending) },
      ],
    });
  };

  return (
    <Screen title={t`Резервна копія`}>
      <Card>
        <Row>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} />
          <Text variant="heading">{t`Експорт`}</Text>
        </Row>
        <Text variant="muted">
          {t`Збережи копію у файл: у Google Drive, Telegram чи інше місце. Фото прогресу й вправ теж потрапляють у копію.`}
        </Text>
        <Button
          title={t`Створити копію`}
          icon="share-outline"
          onPress={startExport}
          loading={busy === 'export'}
          disabled={busy !== null}
        />
      </Card>
      <Card>
        <Row>
          <Ionicons name="server-outline" size={20} color={colors.accent} />
          <Text variant="heading">{t`На сервері`}</Text>
        </Row>
        <Text variant="muted">
          {t`Раз на добу, коли відкриваєш застосунок, копія сама зберігається у твоєму акаунті. Сервер тримає копії за останні 7 днів. Торкнись копії, щоб відновити з неї дані.`}
        </Text>
        {serverBackups === null && (
          <Text variant="secondary">
            {t`Не вдалося отримати список копій.`}
          </Text>
        )}
        {serverBackups?.length === 0 && (
          <Text variant="secondary">{t`Копій ще немає.`}</Text>
        )}
        {serverBackups?.map((b) => (
          <Pressable
            key={b.id}
            style={({ pressed }) => [styles.backup, pressed && styles.pressed]}
            onPress={() => startDownload(b)}
            disabled={busy !== null}>
            <View style={styles.backupText}>
              <Text>{new Date(b.uploadedAt).toLocaleString(locale)}</Text>
              <Text variant="muted">
                {formatSize(b.size)}
                {b.appVersion ? ` · v${b.appVersion}` : ''}
              </Text>
            </View>
            <Ionicons name="cloud-download-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
        <Button
          title={t`Зберегти зараз`}
          icon="cloud-upload-outline"
          variant="secondary"
          onPress={startUpload}
          loading={busy === 'upload' || busy === 'download'}
          disabled={busy !== null}
        />
      </Card>
      <Card>
        <Row>
          <Ionicons name="cloud-download-outline" size={20} color={colors.accent} />
          <Text variant="heading">{t`Відновлення`}</Text>
        </Row>
        <Text variant="muted">
          {t`Вибери файл копії. Він замінить усі поточні дані, тож за потреби спершу створи копію поточних.`}
        </Text>
        <Button
          title={t`Відновити з файлу`}
          icon="folder-open-outline"
          variant="secondary"
          onPress={startImport}
          loading={busy === 'import'}
          disabled={busy !== null}
        />
      </Card>
      {dialog.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  backupText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
});
