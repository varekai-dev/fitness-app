import { useState } from 'react';

import { useDialog } from '@/components/dialog';
import { IconButton } from '@/components/ui';
import { reportAiAnswer, type AiFeature } from '@/lib/account';
import { tr } from '@/lib/i18n';

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
        title: tr('Дякуємо', 'Thanks'),
        message: tr(
          'Скаргу надіслано. Ми переглянемо цю відповідь.',
          'The report is sent. We’ll review this answer.',
        ),
        icon: 'checkmark-circle-outline',
        buttons: [{ text: tr('Зрозуміло', 'OK') }],
      });
    } catch (e) {
      dialog.show({
        title: tr('Не вдалося надіслати', 'Couldn’t send'),
        message: e instanceof Error ? e.message : undefined,
        icon: 'alert-circle-outline',
        buttons: [{ text: tr('Зрозуміло', 'OK') }],
      });
    } finally {
      setSending(false);
    }
  };

  const confirm = () =>
    dialog.show({
      title: tr('Поскаржитися на відповідь AI?', 'Report this AI answer?'),
      message: tr(
        'Якщо відповідь образлива, небезпечна чи недоречна, надішли її нам, і ми її переглянемо.',
        'If the answer is offensive, harmful or inappropriate, send it to us and we’ll review it.',
      ),
      icon: 'flag-outline',
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        { text: tr('Поскаржитися', 'Report'), style: 'destructive', onPress: send },
      ],
    });

  return (
    <>
      <IconButton icon="flag-outline" size={18} onPress={confirm} disabled={sending} />
      {dialog.element}
    </>
  );
}
