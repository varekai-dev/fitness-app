import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, CircleButton, Field, Row, Screen, Text } from '@/components/ui';
import { getKcalGoal, setKcalGoal } from '@/db/food';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatKcal, KCAL_GOAL_STEP, MAX_KCAL_GOAL, MIN_KCAL_GOAL } from '@/lib/food';
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
  const { data: goal } = useDbQuery(getKcalGoal);

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

  const changeGoal = (delta: number) => {
    if (goal === undefined) return;
    const next = Math.min(Math.max(goal + delta, MIN_KCAL_GOAL), MAX_KCAL_GOAL);
    if (next === goal) return;
    Haptics.selectionAsync();
    setKcalGoal(next);
  };

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

      <Text variant="overline">Харчування</Text>
      <Card>
        <Row style={styles.spaceBetween}>
          <View style={styles.flex}>
            <Text variant="heading">Денна ціль</Text>
            <Text variant="muted">Крок {KCAL_GOAL_STEP} ккал</Text>
          </View>
          <Row style={styles.stepper}>
            <CircleButton
              icon="remove"
              size={36}
              disabled={goal === undefined || goal <= MIN_KCAL_GOAL}
              onPress={() => changeGoal(-KCAL_GOAL_STEP)}
            />
            <Text variant="heading" style={styles.goalValue}>
              {goal === undefined ? '—' : formatKcal(goal)}
            </Text>
            <CircleButton
              icon="add"
              size={36}
              disabled={goal === undefined || goal >= MAX_KCAL_GOAL}
              onPress={() => changeGoal(KCAL_GOAL_STEP)}
            />
          </Row>
        </Row>
      </Card>
      {dialog.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  saved: { marginVertical: spacing.xs },
  spaceBetween: { justifyContent: 'space-between' },
  stepper: { gap: spacing.sm },
  goalValue: { minWidth: 64, textAlign: 'center' },
});
