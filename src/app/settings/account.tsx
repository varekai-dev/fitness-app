import Ionicons from '@expo/vector-icons/Ionicons';

import { StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Loading, Row, Screen, Text } from '@/components/ui';
import { logout, useAccount, type User } from '@/lib/account';
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
