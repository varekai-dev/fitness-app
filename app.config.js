/**
 * Derives `android.versionCode` from `expo.version`, so every version bump gives a
 * higher build number without anyone tracking it: 1.34.2 → 1034002.
 * Android refuses to install an APK over one with a higher versionCode.
 */
module.exports = ({ config }) => {
  const [major, minor, patch] = config.version.split('.').map(Number);
  return {
    ...config,
    android: { ...config.android, versionCode: major * 1_000_000 + minor * 1_000 + patch },
  };
};
