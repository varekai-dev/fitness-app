import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Loading, Row, Screen, Text } from '@/components/ui';
import { deleteAccount, logout, useAccount, type User } from '@/lib/account';
import { locale } from '@/lib/i18n';
import { colors } from '@/theme';

/** Signed-out users never get here: the root layout shows the sign-in screen instead. */
export default function AccountScreen() {
  const user = useAccount();
  return (
    <Screen title={t`Акаунт`}>{user ? <SignedIn user={user} /> : <Loading />}</Screen>
  );
}

function SignedIn({ user }: { user: User }) {
  const dialog = useDialog();
  const [isDeleting, setIsDeleting] = useState(false);
  const confirmLogout = () =>
    dialog.show({
      title: t`Вийти з акаунта?`,
      message: t`Дані на цьому телефоні залишаться.`,
      icon: 'log-out-outline',
      buttons: [
        { text: t`Скасувати`, style: 'cancel' },
        { text: t`Вийти`, style: 'destructive', onPress: logout },
      ],
    });
  const remove = async () => {
    setIsDeleting(true);
    try {
      // Signs out on success, and the root layout swaps this screen for sign-in.
      await deleteAccount();
    } catch (e) {
      setIsDeleting(false);
      dialog.show({
        title: t`Не вдалося видалити акаунт`,
        message: e instanceof Error ? e.message : undefined,
        icon: 'alert-circle-outline',
        buttons: [{ text: t`Зрозуміло` }],
      });
    }
  };
  const confirmDelete = () =>
    dialog.show({
      title: t`Видалити акаунт?`,
      message: t`Акаунт і всі його резервні копії на сервері зникнуть назавжди. Дані на цьому телефоні залишаться.`,
      icon: 'trash-outline',
      buttons: [
        { text: t`Скасувати`, style: 'cancel' },
        { text: t`Видалити`, style: 'destructive', onPress: remove },
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
          {t`Акаунт від`}{' '}
          {new Date(user.createdAt).toLocaleDateString(locale, { dateStyle: 'long' })}
        </Text>
        <Button
          title={t`Вийти`}
          icon="log-out-outline"
          variant="danger"
          onPress={confirmLogout}
          disabled={isDeleting}
        />
      </Card>
      <Card>
        <Text variant="muted">
          {t`Видаляє акаунт і резервні копії на сервері. Тренування, їжа й інші дані на телефоні залишаться.`}
        </Text>
        <Button
          title={t`Видалити акаунт`}
          icon="trash-outline"
          variant="destructive"
          loading={isDeleting}
          onPress={confirmDelete}
        />
      </Card>
      {dialog.element}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
