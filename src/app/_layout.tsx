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

  const error = migrationError ?? seedError;
  useEffect(() => {
    if (ready || error) SplashScreen.hideAsync();
  }, [ready, error]);

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
  if (!ready) return null;

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
