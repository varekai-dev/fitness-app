import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Field, Loading, Row, Screen, Text } from '@/components/ui';
import {
  AccountError,
  login,
  logout,
  MIN_PASSWORD,
  register,
  requestPasswordReset,
  resetPassword,
  useAccount,
  type User,
} from '@/lib/account';
import { locale, tr } from '@/lib/i18n';
import { colors, spacing } from '@/theme';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function AccountScreen() {
  const user = useAccount();
  return (
    <Screen title={tr('Акаунт', 'Account')}>
      {user === undefined ? <Loading /> : user ? <SignedIn user={user} /> : <SignedOut />}
    </Screen>
  );
}

function SignedIn({ user }: { user: User }) {
  const dialog = useDialog();
  const confirmLogout = () =>
    dialog.show({
      title: tr('Вийти з акаунта?', 'Sign out?'),
      message: tr(
        'Дані на цьому телефоні залишаться.',
        'The data on this phone stays where it is.',
      ),
      icon: 'log-out-outline',
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        { text: tr('Вийти', 'Sign out'), style: 'destructive', onPress: logout },
      ],
    });
  return (
    <>
      <Card>
        <Row>
          <Ionicons name="person-circle-outline" size={20} color={colors.accent} />
          <Text variant="heading" style={styles.flex} numberOfLines={1}>
            {user.email}
          </Text>
        </Row>
        <Text variant="muted">
          {tr('Акаунт від', 'Account since')}{' '}
          {new Date(user.createdAt).toLocaleDateString(locale, { dateStyle: 'long' })}
        </Text>
        <Button
          title={tr('Вийти', 'Sign out')}
          icon="log-out-outline"
          variant="danger"
          onPress={confirmLogout}
        />
      </Card>
      {dialog.element}
    </>
  );
}

const TITLES: Record<Mode, () => string> = {
  login: () => tr('Вхід', 'Sign in'),
  register: () => tr('Реєстрація', 'Create account'),
  forgot: () => tr('Забули пароль', 'Forgot password'),
  reset: () => tr('Новий пароль', 'New password'),
};

function SignedOut() {
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
            ? tr(
                'Надішлемо на пошту код, щоб задати новий пароль.',
                'We’ll email you a code to set a new password.',
              )
            : mode === 'reset'
              ? tr(
                  `Код надіслано на ${email.trim()}. Він діє 15 хвилин. Не бачиш листа — заглянь у спам.`,
                  `The code was sent to ${email.trim()}. It works for 15 minutes. No email? Check spam.`,
                )
              : tr(
                  'Дані поки зберігаються лише на цьому телефоні.',
                  'The data is still stored only on this phone.',
                )}
        </Text>
        {mode !== 'reset' && (
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder={tr('Пошта', 'Email')}
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
            placeholder={tr('Код із листа', 'Code from the email')}
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
                ? tr('Пароль', 'Password')
                : tr(
                    `Новий пароль, від ${MIN_PASSWORD} символів`,
                    `New password, ${MIN_PASSWORD}+ characters`,
                  )
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
              login: tr('Увійти', 'Sign in'),
              register: tr('Створити акаунт', 'Create account'),
              forgot: tr('Надіслати код', 'Send code'),
              reset: tr('Зберегти пароль', 'Save password'),
            }[mode]
          }
          onPress={submit}
          loading={busy}
          disabled={!ready}
        />
        {mode === 'login' && (
          <Button
            title={tr('Забули пароль?', 'Forgot password?')}
            variant="ghost"
            small
            onPress={() => switchTo('forgot')}
          />
        )}
        {mode === 'reset' && (
          <Button
            title={tr('Надіслати код ще раз', 'Send the code again')}
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
            ? tr('Немає акаунта? Зареєструватися', 'No account? Create one')
            : tr('Уже є акаунт? Увійти', 'Have an account? Sign in')
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
