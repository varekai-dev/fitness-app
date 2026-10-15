import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Field, Row, Screen, Text } from '@/components/ui';
import {
  checkGroqKey,
  deleteGroqKey,
  getGroqKey,
  GROQ_MODEL,
  maskKey,
  setGroqKey,
} from '@/lib/groq';
import { colors, spacing } from '@/theme';

const KEYS_URL = 'https://console.groq.com/keys';

export default function SettingsScreen() {
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
          title: 'Ключ не підходить',
          message: 'Groq відхилив цей ключ. Скопіюй його ще раз з консолі Groq.',
          icon: 'alert-circle',
        });
        return;
      }
      await setGroqKey(key);
      setSavedKey(key);
      setInput('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (check === 'error') {
        dialog.show({
          title: 'Ключ збережено',
          message: 'Не вдалося перевірити його зараз — перевіримо під час першого запиту.',
        });
      }
    } catch (e) {
      dialog.show({ title: 'Не вдалося зберегти', message: String(e), icon: 'alert-circle' });
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    dialog.show({
      title: 'Видалити ключ?',
      message: 'Нові страви не будуть розраховуватися, доки не додаси ключ знову.',
      buttons: [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => deleteGroqKey().then(() => setSavedKey(null)),
        },
      ],
    });

  return (
    <Screen title="Налаштування">
      <Card onPress={() => router.push('/profile')}>
        <Row style={styles.spaceBetween}>
          <Row>
            <Ionicons name="person-outline" size={20} color={colors.accent} />
            <Text variant="heading">Профіль</Text>
          </Row>
          <Row>
            <Text variant="muted">Вага, зріст, вік</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
        </Row>
      </Card>

      <Text variant="overline">Groq AI</Text>
      <Card>
        <Row>
          <Ionicons name="key-outline" size={20} color={colors.accent} />
          <Text variant="heading">Ключ Groq API</Text>
        </Row>
        <Text variant="muted">
          Потрібен, щоб рахувати калорії та БЖВ страв. Ключ зберігається лише на цьому пристрої в
          захищеному сховищі. Модель: {GROQ_MODEL}.
        </Text>
        {savedKey ? (
          <Row style={styles.saved}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text variant="body" style={styles.flex}>
              {maskKey(savedKey)}
            </Text>
            <Button title="Видалити" variant="danger" small onPress={remove} />
          </Row>
        ) : savedKey === null ? (
          <Text variant="caption">Ключ ще не додано.</Text>
        ) : null}
        <Field
          value={input}
          onChangeText={setInput}
          placeholder={savedKey ? 'Новий ключ, щоб замінити' : 'gsk_…'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          onSubmitEditing={save}
        />
        <Button
          title={savedKey ? 'Замінити ключ' : 'Зберегти ключ'}
          icon="save-outline"
          onPress={save}
          loading={saving}
          disabled={!input.trim()}
        />
        <Button
          title="Отримати ключ у консолі Groq"
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
  spaceBetween: { justifyContent: 'space-between' },
});
