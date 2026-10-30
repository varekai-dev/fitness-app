import { t } from '@lingui/core/macro';
import { useState } from 'react';

import { useDialog } from '@/components/dialog';
import { IconButton } from '@/components/ui';
import { reportAiAnswer, type AiFeature } from '@/lib/account';

/**
 * A flag beside an AI answer: sends it to the server for review when the user
 * finds it offensive or harmful. Google Play asks for one wherever generated
 * content is shown.
 */
export function ReportAiButton({ feature, content }: { feature: AiFeature; content: unknown }) {
  const dialog = useDialog();
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await reportAiAnswer(feature, content);
      dialog.show({
        title: t`Дякуємо`,
        message: t`Скаргу надіслано. Ми переглянемо цю відповідь.`,
        icon: 'checkmark-circle-outline',
        buttons: [{ text: t`Зрозуміло` }],
      });
    } catch (e) {
      dialog.show({
        title: t`Не вдалося надіслати`,
        message: e instanceof Error ? e.message : undefined,
        icon: 'alert-circle-outline',
        buttons: [{ text: t`Зрозуміло` }],
      });
    } finally {
      setSending(false);
    }
  };

  const confirm = () =>
    dialog.show({
      title: t`Поскаржитися на відповідь AI?`,
      message: t`Якщо відповідь образлива, небезпечна чи недоречна, надішли її нам, і ми її переглянемо.`,
      icon: 'flag-outline',
      buttons: [
        { text: t`Скасувати`, style: 'cancel' },
        { text: t`Поскаржитися`, style: 'destructive', onPress: send },
      ],
    });

  return (
    <>
      <IconButton icon="flag-outline" size={18} onPress={confirm} disabled={sending} />
      {dialog.element}
    </>
  );
}
