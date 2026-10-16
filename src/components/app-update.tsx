import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Button, Card, Row, Text } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { colors } from '@/theme';

/** Release APKs are published here by .github/workflows/release.yml. */
const LATEST_RELEASE_URL =
  'https://api.github.com/repos/varekai-dev/fitness-app-releases/releases/latest';

/** Over-the-air updates only work in release builds, not in Expo Go or a dev server. */
const updatesAvailable = Updates.isEnabled && !__DEV__;

/** New APKs (native changes) come from GitHub releases, and only for Android. */
const apkUpdatesAvailable = updatesAvailable && Platform.OS === 'android';

/** Comes from the running update, so it goes up with every OTA update too. */
const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

type Release = { version: string; apkUrl: string };

/** "v1.32.1-15" → [1, 32, 1]; older tags carry the build number after the dash. */
const parseVersion = (tag: string) => tag.replace(/^v/, '').split('-')[0].split('.').map(Number);

function isNewer(tag: string, than: string) {
  const a = parseVersion(tag);
  const b = parseVersion(than);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

async function fetchLatestRelease(): Promise<Release> {
  const res = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const release = await res.json();
  const apk = release.assets?.find((asset: { name: string }) => asset.name.endsWith('.apk'));
  if (!apk) throw new Error('No APK in the latest release');
  return { version: release.tag_name, apkUrl: apk.browser_download_url };
}

/**
 * App version with a button to update. JS changes arrive as an EAS Update and install
 * in place; native changes need a new APK, downloaded from the latest GitHub release
 * and installed over the current app (same signing key, higher versionCode).
 * Nothing is downloaded on its own (`checkAutomatically: NEVER`), only from here.
 */
export function AppUpdateCard() {
  const {
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
    checkError,
    downloadError,
  } = Updates.useUpdates();

  const [isCheckingApk, setIsCheckingApk] = useState(apkUpdatesAvailable);
  const [apkCheckError, setApkCheckError] = useState(false);
  const [latestApk, setLatestApk] = useState<Release | null>(null);

  const loadLatestApk = useCallback(
    () =>
      fetchLatestRelease()
        .then(setLatestApk, () => setApkCheckError(true))
        .finally(() => setIsCheckingApk(false)),
    [],
  );

  const check = () => {
    Updates.checkForUpdateAsync().catch(() => {});
    if (!apkUpdatesAvailable) return;
    setIsCheckingApk(true);
    setApkCheckError(false);
    loadLatestApk();
  };

  useEffect(() => {
    if (updatesAvailable) Updates.checkForUpdateAsync().catch(() => {});
    if (apkUpdatesAvailable) loadLatestApk();
  }, [loadLatestApk]);

  const hasOtaUpdate = isUpdateAvailable || isUpdatePending;
  const hasApkUpdate = latestApk !== null && isNewer(latestApk.version, currentVersion);

  const installOta = async () => {
    Haptics.selectionAsync();
    try {
      if (!isUpdatePending) await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      // Shown through downloadError.
    }
  };

  const downloadApk = () => {
    Haptics.selectionAsync();
    if (latestApk) Linking.openURL(latestApk.apkUrl);
  };

  const status = !updatesAvailable
    ? tr('Оновлення працюють лише в зібраному застосунку', 'Updates work only in a built app')
    : isChecking || isCheckingApk
      ? tr('Перевіряю оновлення…', 'Checking for updates…')
      : downloadError
        ? tr('Не вдалося завантажити оновлення', 'Couldn’t download the update')
        : hasOtaUpdate
          ? tr('Доступна нова версія', 'A new version is available')
          : hasApkUpdate
            ? tr(
                `Доступна версія ${parseVersion(latestApk.version).join('.')} — потрібно встановити новий APK`,
                `Version ${parseVersion(latestApk.version).join('.')} is available as a new APK`,
              )
            : checkError || apkCheckError
              ? tr('Не вдалося перевірити оновлення', 'Couldn’t check for updates')
              : tr('У тебе остання версія', 'You’re on the latest version');

  return (
    <Card>
      <Row>
        <Ionicons name="cloud-download-outline" size={20} color={colors.accent} />
        <Text variant="heading">
          {tr('Версія', 'Version')} {currentVersion}
        </Text>
      </Row>
      <Text variant="muted">{status}</Text>
      {updatesAvailable &&
        (hasOtaUpdate ? (
          <Button
            title={tr('Оновити', 'Update')}
            icon="refresh"
            small
            loading={isDownloading}
            onPress={installOta}
          />
        ) : hasApkUpdate ? (
          <Button
            title={tr('Завантажити APK', 'Download APK')}
            icon="download"
            small
            onPress={downloadApk}
          />
        ) : (
          <Button
            title={tr('Перевірити', 'Check')}
            variant="secondary"
            small
            loading={isChecking || isCheckingApk}
            onPress={check}
          />
        ))}
    </Card>
  );
}
