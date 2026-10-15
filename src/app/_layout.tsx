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
import { useHealthConnectAutoSync } from '@/hooks/use-health-connect-auto-sync';
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

  useHealthConnectAutoSync(ready);

  const error = migrationError ?? seedError;
  useEffect(() => {
    if (ready || error) SplashScreen.hideAsync();
  }, [ready, error]);

  if (error) {
    return (
      <View style={styles.error}>
        <Text variant="heading">Не вдалося відкрити базу даних</Text>
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
          <Stack.Screen name="exercise/edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="pick-exercise" options={{ presentation: 'modal' }} />
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
