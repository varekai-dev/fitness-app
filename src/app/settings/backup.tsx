import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';

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
import { colors } from '@/theme';

/** Export all data to a file and restore it, e.g. on a new phone. */
export default function BackupSettingsScreen() {
  const dialog = useDialog();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const fail = (title: string, e: unknown) =>
    dialog.show({
      title,
      message: e instanceof BackupError ? e.message : String(e),
      icon: 'alert-circle',
    });

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
    if (!pending) return;
    const s = pending.summary;
    const lines = [
      tr(
        `Копія від ${new Date(s.exportedAt).toLocaleString(locale)}`,
        `Backup from ${new Date(s.exportedAt).toLocaleString(locale)}`,
      ) + (s.appVersion ? ` (v${s.appVersion})` : '') + ':',
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
    const chosen = pending;
    dialog.show({
      title: tr('Замінити всі дані?', 'Replace all data?'),
      message: lines.join('\n'),
      icon: 'warning-outline',
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel', onPress: () => discardBackup(chosen) },
        { text: tr('Замінити', 'Replace'), style: 'destructive', onPress: () => restore(chosen) },
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
            'Усі дані зберігаються лише на цьому телефоні. Збережи копію в Google Drive, Telegram чи іншому місці, щоб не втратити їх разом із телефоном. Фото прогресу й вправ теж потрапляють у копію, ключ Groq — ні.',
            'All data is stored only on this phone. Save a backup to Google Drive, Telegram or elsewhere so you don’t lose it with the phone. Progress photos and exercise images are included, the Groq key isn’t.',
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
