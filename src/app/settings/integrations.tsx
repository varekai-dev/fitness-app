import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { HealthCard } from '@/components/health-card';
import { Button, Card, Field, Row, Screen, Text } from '@/components/ui';
import {
  checkGroqKey,
  deleteGroqKey,
  getGroqKey,
  GROQ_MODEL,
  maskKey,
  setGroqKey,
} from '@/lib/groq';
import { tr } from '@/lib/i18n';
import { colors, spacing } from '@/theme';

const KEYS_URL = 'https://console.groq.com/keys';

export default function IntegrationsScreen() {
  const dialog = useDialog();
  // undefined while loading, null when no key is stored.
  const [savedKey, setSavedKey] = useState<string | null | undefined>(undefined);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getGroqKey()
      .then(setSavedKey)
      .catch(() => setSavedKey(null));
  }, []);

  const save = async () => {
    const key = input.trim();
    if (!key) return;
    setSaving(true);
    try {
      const check = await checkGroqKey(key);
      if (check === 'invalid') {
        dialog.show({
          title: tr('Ключ не підходить', 'Key doesn’t work'),
          message: tr(
            'Groq відхилив цей ключ. Скопіюй його ще раз з консолі Groq.',
            'Groq rejected this key. Copy it again from the Groq console.',
          ),
          icon: 'alert-circle',
        });
        return;
      }
      await setGroqKey(key);
      setSavedKey(key);
      setInput('');
      if (check === 'error') {
        dialog.show({
          title: tr('Ключ збережено', 'Key saved'),
          message: tr(
            'Не вдалося перевірити його зараз — перевіримо під час першого запиту.',
            'Couldn’t check it right now. It will be checked on the first request.',
          ),
        });
      }
    } catch (e) {
      dialog.show({
        title: tr('Не вдалося зберегти', 'Couldn’t save'),
        message: String(e),
        icon: 'alert-circle',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    dialog.show({
      title: tr('Видалити ключ?', 'Delete key?'),
      message: tr(
        'Нові страви не будуть розраховуватися, доки не додаси ключ знову.',
        'New dishes won’t be calculated until you add a key again.',
      ),
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        {
          text: tr('Видалити', 'Delete'),
          style: 'destructive',
          onPress: () => deleteGroqKey().then(() => setSavedKey(null)),
        },
      ],
    });

  return (
    <Screen title={tr('Інтеграції', 'Integrations')}>
      {Platform.OS !== 'web' && (
        <>
          <Text variant="overline">{tr('Здоров’я', 'Health')}</Text>
          <HealthCard />
        </>
      )}

      <Text variant="overline">Groq AI</Text>
      <Card>
        <Row>
          <Ionicons name="key-outline" size={20} color={colors.accent} />
          <Text variant="heading">{tr('Ключ Groq API', 'Groq API key')}</Text>
        </Row>
        <Text variant="muted">
          {tr(
            'Потрібен, щоб рахувати калорії та БЖВ страв. Ключ зберігається лише на цьому пристрої в захищеному сховищі.',
            'Needed to calculate calories and macros of dishes. The key is stored only on this device, in secure storage.',
          )}{' '}
          {tr('Модель', 'Model')}: {GROQ_MODEL}.
        </Text>
        {savedKey ? (
          <Row style={styles.saved}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text variant="body" style={styles.flex}>
              {maskKey(savedKey)}
            </Text>
            <Button title={tr('Видалити', 'Delete')} variant="danger" small onPress={remove} />
          </Row>
        ) : savedKey === null ? (
          <Text variant="caption">{tr('Ключ ще не додано.', 'No key added yet.')}</Text>
        ) : null}
        <Field
          value={input}
          onChangeText={setInput}
          placeholder={savedKey ? tr('Новий ключ, щоб замінити', 'New key to replace it') : 'gsk_…'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          onSubmitEditing={save}
        />
        <Button
          title={savedKey ? tr('Замінити ключ', 'Replace key') : tr('Зберегти ключ', 'Save key')}
          icon="save-outline"
          onPress={save}
          loading={saving}
          disabled={!input.trim()}
        />
        <Button
          title={tr('Отримати ключ у консолі Groq', 'Get a key in the Groq console')}
          variant="ghost"
          small
          trailingIcon="open-outline"
          onPress={() => WebBrowser.openBrowserAsync(KEYS_URL)}
        />
      </Card>

      {dialog.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  saved: { marginVertical: spacing.xs },
});
