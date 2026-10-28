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
import { locale, tr } from '@/lib/i18n';
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
    ? `${Math.max(1, Math.round(bytes / 1024))} ${tr('КБ', 'KB')}`
    : `${(bytes / 1024 / 1024).toFixed(1)} ${tr('МБ', 'MB')}`;

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
      fail(tr('Не вдалося зберегти копію', 'Couldn’t save the backup'), e);
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
      fail(tr('Не вдалося завантажити копію', 'Couldn’t download the backup'), e);
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
      fail(tr('Не вдалося створити копію', 'Couldn’t create the backup'), e);
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
      fail(tr('Не вдалося відновити дані', 'Couldn’t restore the data'), e);
    }
  };

  const startImport = async () => {
    setBusy('import');
    let pending: PendingBackup | null;
    try {
      pending = await pickBackup();
    } catch (e) {
      fail(tr('Не вдалося відкрити файл', 'Couldn’t open the file'), e);
      return;
    } finally {
      setBusy(null);
    }
    if (pending) confirmRestore(pending);
  };

  const confirmRestore = (pending: PendingBackup) => {
    const s = pending.summary;
    const lines = [
      tr(
        `Копія від ${new Date(s.exportedAt).toLocaleString(locale)}`,
        `Backup from ${new Date(s.exportedAt).toLocaleString(locale)}`,
      ) +
        (s.appVersion ? ` (v${s.appVersion})` : '') +
        ':',
      `${tr('тренувань', 'workouts')}: ${s.workouts}`,
      `${tr('записів їжі', 'food entries')}: ${s.foodEntries}`,
      `${tr('зважувань', 'weigh-ins')}: ${s.bodyWeights}`,
      `${tr('фото прогресу', 'progress photos')}: ${s.photos}`,
      `${tr('фото вправ', 'exercise images')}: ${s.exerciseImages}`,
      '',
      tr(
        'Усі поточні дані на цьому телефоні буде замінено. Це не можна скасувати.',
        'All current data on this phone will be replaced. This can’t be undone.',
      ),
    ];
    dialog.show({
      title: tr('Замінити всі дані?', 'Replace all data?'),
      message: lines.join('\n'),
      icon: 'warning-outline',
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel', onPress: () => discardBackup(pending) },
        { text: tr('Замінити', 'Replace'), style: 'destructive', onPress: () => restore(pending) },
      ],
    });
  };

  return (
    <Screen title={tr('Резервна копія', 'Backup')}>
      <Card>
        <Row>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} />
          <Text variant="heading">{tr('Експорт', 'Export')}</Text>
        </Row>
        <Text variant="muted">
          {tr(
            'Збережи копію у файл: у Google Drive, Telegram чи інше місце. Фото прогресу й вправ теж потрапляють у копію.',
            'Save a backup to a file: to Google Drive, Telegram or elsewhere. Progress photos and exercise images are included.',
          )}
        </Text>
        <Button
          title={tr('Створити копію', 'Create backup')}
          icon="share-outline"
          onPress={startExport}
          loading={busy === 'export'}
          disabled={busy !== null}
        />
      </Card>
      <Card>
        <Row>
          <Ionicons name="server-outline" size={20} color={colors.accent} />
          <Text variant="heading">{tr('На сервері', 'On the server')}</Text>
        </Row>
        <Text variant="muted">
          {tr(
            'Раз на добу, коли відкриваєш застосунок, копія сама зберігається у твоєму акаунті. Сервер тримає копії за останні 7 днів. Торкнись копії, щоб відновити з неї дані.',
            'Once a day, when you open the app, a backup is saved to your account. The server keeps the last 7 days. Tap a backup to restore from it.',
          )}
        </Text>
        {serverBackups === null && (
          <Text variant="secondary">
            {tr('Не вдалося отримати список копій.', 'Couldn’t load the list of backups.')}
          </Text>
        )}
        {serverBackups?.length === 0 && (
          <Text variant="secondary">{tr('Копій ще немає.', 'No backups yet.')}</Text>
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
          title={tr('Зберегти зараз', 'Back up now')}
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
          <Text variant="heading">{tr('Відновлення', 'Restore')}</Text>
        </Row>
        <Text variant="muted">
          {tr(
            'Вибери файл копії. Він замінить усі поточні дані, тож за потреби спершу створи копію поточних.',
            'Pick a backup file. It replaces all current data, so back up the current data first if you need it.',
          )}
        </Text>
        <Button
          title={tr('Відновити з файлу', 'Restore from file')}
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
