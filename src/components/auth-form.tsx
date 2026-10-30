import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Field, Row, Text } from '@/components/ui';
import {
  AccountError,
  login,
  MIN_PASSWORD,
  register,
  requestPasswordReset,
  resetPassword,
} from '@/lib/account';
import { openPrivacyPolicy } from '@/lib/legal';
import { colors, spacing } from '@/theme';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const TITLES: Record<Mode, () => string> = {
  login: () => t`Вхід`,
  register: () => t`Реєстрація`,
  forgot: () => t`Забули пароль`,
  reset: () => t`Новий пароль`,
};

/** Sign in, create an account, or reset a forgotten password with an emailed code. */
export function AuthForm() {
  const dialog = useDialog();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      dialog.show({
        title: TITLES[mode](),
        message: e instanceof AccountError ? e.message : String(e),
        icon: 'alert-circle',
      });
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setPassword('');
    setCode('');
  };

  const sendCode = () =>
    run(async () => {
      await requestPasswordReset(email.trim());
      switchTo('reset');
    });

  const submit = {
    login: () => run(() => login(email.trim(), password)),
    register: () => run(() => register(email.trim(), password)),
    forgot: sendCode,
    reset: () => run(() => resetPassword(email.trim(), code.trim(), password)),
  }[mode];

  const ready =
    email.trim().length > 0 &&
    (mode === 'forgot' ||
      (password.length >= (mode === 'login' ? 1 : MIN_PASSWORD) &&
        (mode !== 'reset' || code.trim().length === 6)));

  return (
    <>
      <Card>
        <Row>
          <Ionicons
            name={mode === 'login' || mode === 'register' ? 'person-outline' : 'key-outline'}
            size={20}
            color={colors.accent}
          />
          <Text variant="heading">{TITLES[mode]()}</Text>
        </Row>
        <Text variant="muted">
          {mode === 'forgot'
            ? t`Надішлемо на пошту код, щоб задати новий пароль.`
            : mode === 'reset'
              ? t`Код надіслано на ${email.trim()}. Він діє 15 хвилин. Не бачиш листа — заглянь у спам.`
              : t`Усе, що вже є на цьому телефоні, залишиться на ньому.`}
        </Text>
        {mode !== 'reset' && (
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder={t`Пошта`}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        )}
        {mode === 'reset' && (
          <Field
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
            placeholder={t`Код із листа`}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
        )}
        {mode !== 'forgot' && (
          <Field
            value={password}
            onChangeText={setPassword}
            placeholder={
              mode === 'login'
                ? t`Пароль`
                : t`Новий пароль, від ${MIN_PASSWORD} символів`
            }
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            onSubmitEditing={() => ready && submit()}
          />
        )}
        <Button
          title={
            {
              login: t`Увійти`,
              register: t`Створити акаунт`,
              forgot: t`Надіслати код`,
              reset: t`Зберегти пароль`,
            }[mode]
          }
          onPress={submit}
          loading={busy}
          disabled={!ready}
        />
        {mode === 'login' && (
          <Button
            title={t`Забули пароль?`}
            variant="ghost"
            small
            onPress={() => switchTo('forgot')}
          />
        )}
        {mode === 'register' && (
          <Button
            title={t`Політика конфіденційності`}
            variant="ghost"
            small
            trailingIcon="open-outline"
            onPress={openPrivacyPolicy}
          />
        )}
        {mode === 'reset' && (
          <Button
            title={t`Надіслати код ще раз`}
            variant="ghost"
            small
            disabled={busy}
            onPress={sendCode}
          />
        )}
      </Card>
      <Button
        title={
          mode === 'login'
            ? t`Немає акаунта? Зареєструватися`
            : t`Уже є акаунт? Увійти`
        }
        variant="ghost"
        onPress={() => switchTo(mode === 'login' ? 'register' : 'login')}
        style={styles.switch}
      />
      {dialog.element}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  switch: { marginTop: spacing.xs },
});
