import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Text } from '@/components/ui';
import { db } from '@/db/client';
import { runContentSeeds, seedIfEmpty } from '@/db/seed';
import { useHealthAutoSync } from '@/hooks/use-health-auto-sync';
import { useHomeWidgetSync } from '@/hooks/use-home-widget-sync';
import { useNotifications } from '@/hooks/use-notifications';
import { useAccount } from '@/lib/account';
import { tr } from '@/lib/i18n';
import { colors } from '@/theme';
import migrations from '../../drizzle/migrations';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  const { success, error: migrationError } = useMigrations(db, migrations);
  const [ready, setReady] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);

  useEffect(() => {
    if (!success) return;
    seedIfEmpty()
      .then(() => {
        runContentSeeds();
        setReady(true);
      })
      .catch(setSeedError);
  }, [success]);

  useHealthAutoSync(ready);
  useNotifications(ready);
  useHomeWidgetSync(ready);

  // undefined while the saved session is read, so the splash covers it too.
  const user = useAccount();
  const loaded = ready && user !== undefined;

  const error = migrationError ?? seedError;
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (error) {
    return (
      <View style={styles.error}>
        <Text variant="heading">
          {tr('Не вдалося відкрити базу даних', 'Couldn’t open the database')}
        </Text>
        <Text variant="secondary">{error.message}</Text>
      </View>
    );
  }
  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          {/*
            Every route has to be listed here: Expo Router leaves undeclared ones
            unguarded. Signed out, the only screen left is sign-in, and signing
            in drops it and opens the tabs.
          */}
          <Stack.Protected guard={!!user}>
            {/*
              First on purpose: the Stack mounts only once the database is ready,
              after the launch URL was read, and then opens its first screen.
            */}
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="exercise/edit" options={{ presentation: 'modal' }} />
            <Stack.Screen name="pick-exercise" options={{ presentation: 'modal' }} />
            <Stack.Screen name="widgets" options={{ presentation: 'modal' }} />
            <Stack.Screen name="add-food" options={{ presentation: 'modal' }} />
            <Stack.Screen name="food-entry/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="macro" options={{ presentation: 'modal' }} />
            <Stack.Screen name="program/ai" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="workout/[id]"
              options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
            />
            <Stack.Screen name="achievements" />
            <Stack.Screen name="body-weight" />
            <Stack.Screen name="exercise/[id]" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="program/[id]" />
            <Stack.Screen name="program/day/[id]" />
            <Stack.Screen name="progress-photos" />
            <Stack.Screen name="recap" />
            <Stack.Screen name="settings/index" />
            <Stack.Screen name="settings/account" />
            <Stack.Screen name="settings/app" />
            <Stack.Screen name="settings/backup" />
            <Stack.Screen name="settings/food" />
            <Stack.Screen name="settings/integrations" />
            <Stack.Screen name="settings/notifications" />
            <Stack.Screen name="settings/water" />
          </Stack.Protected>
          <Stack.Protected guard={!user}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: {
    flex: 1,
    padding: 24,
    gap: 8,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
