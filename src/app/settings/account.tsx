import Ionicons from '@expo/vector-icons/Ionicons';

import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Loading, Row, Screen, Text } from '@/components/ui';
import { deleteAccount, logout, useAccount, type User } from '@/lib/account';
import { locale, tr } from '@/lib/i18n';
import { colors } from '@/theme';

/** Signed-out users never get here: the root layout shows the sign-in screen instead. */
export default function AccountScreen() {
  const user = useAccount();
  return (
    <Screen title={tr('Акаунт', 'Account')}>{user ? <SignedIn user={user} /> : <Loading />}</Screen>
  );
}

function SignedIn({ user }: { user: User }) {
  const dialog = useDialog();
  const [isDeleting, setIsDeleting] = useState(false);
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
  const remove = async () => {
    setIsDeleting(true);
    try {
      // Signs out on success, and the root layout swaps this screen for sign-in.
      await deleteAccount();
    } catch (e) {
      setIsDeleting(false);
      dialog.show({
        title: tr('Не вдалося видалити акаунт', 'Couldn’t delete the account'),
        message: e instanceof Error ? e.message : undefined,
        icon: 'alert-circle-outline',
        buttons: [{ text: tr('Зрозуміло', 'OK') }],
      });
    }
  };
  const confirmDelete = () =>
    dialog.show({
      title: tr('Видалити акаунт?', 'Delete the account?'),
      message: tr(
        'Акаунт і всі його резервні копії на сервері зникнуть назавжди. Дані на цьому телефоні залишаться.',
        'The account and all its backups on the server are gone for good. The data on this phone stays where it is.',
      ),
      icon: 'trash-outline',
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        { text: tr('Видалити', 'Delete'), style: 'destructive', onPress: remove },
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
          disabled={isDeleting}
        />
      </Card>
      <Card>
        <Text variant="muted">
          {tr(
            'Видаляє акаунт і резервні копії на сервері. Тренування, їжа й інші дані на телефоні залишаться.',
            'Deletes the account and its backups on the server. Workouts, food and the rest of the data on the phone stay.',
          )}
        </Text>
        <Button
          title={tr('Видалити акаунт', 'Delete account')}
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
