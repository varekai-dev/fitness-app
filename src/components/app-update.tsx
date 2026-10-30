import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Button, Card, Row, Text } from '@/components/ui';
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
    try {
      if (!isUpdatePending) await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      // Shown through downloadError.
    }
  };

  const downloadApk = () => {
    if (latestApk) Linking.openURL(latestApk.apkUrl);
  };

  const status = !updatesAvailable
    ? t`Оновлення працюють лише в зібраному застосунку`
    : isChecking || isCheckingApk
      ? t`Перевіряю оновлення…`
      : downloadError
        ? t`Не вдалося завантажити оновлення`
        : hasOtaUpdate
          ? t`Доступна нова версія`
          : hasApkUpdate
            ? t`Доступна версія ${parseVersion(latestApk.version).join('.')} — потрібно встановити новий APK`
            : checkError || apkCheckError
              ? t`Не вдалося перевірити оновлення`
              : t`У тебе остання версія`;

  return (
    <Card>
      <Row>
        <Ionicons name="cloud-download-outline" size={20} color={colors.accent} />
        <Text variant="heading">
          {t`Версія`} {currentVersion}
        </Text>
      </Row>
      <Text variant="muted">{status}</Text>
      {updatesAvailable &&
        (hasOtaUpdate ? (
          <Button
            title={t`Оновити`}
            icon="refresh"
            small
            loading={isDownloading}
            onPress={installOta}
          />
        ) : hasApkUpdate ? (
          <Button
            title={t`Завантажити APK`}
            icon="download"
            small
            onPress={downloadApk}
          />
        ) : (
          <Button
            title={t`Перевірити`}
            variant="secondary"
            small
            loading={isChecking || isCheckingApk}
            onPress={check}
          />
        ))}
    </Card>
  );
}
