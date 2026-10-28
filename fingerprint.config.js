/**
 * The fingerprint is the runtime version, and EAS Update only reaches builds with a
 * matching one. `expo.version` is bumped on every commit, so it must stay out of the
 * fingerprint: otherwise every push needs a new APK and no build ever gets an update.
 * `.gitignore` is skipped too: an ignore rule for non-native files (e.g. the
 * Worker's `.wrangler/`) shouldn't force a new APK.
 * Setting `sourceSkips` replaces the default, so the default skip is kept as well.
 * @type {import('@expo/fingerprint').Config}
 */
const config = {
  sourceSkips: [
    'ExpoConfigVersions',
    'PackageJsonAndroidAndIosScriptsIfNotContainRun',
    'GitIgnore',
  ],
};

module.exports = config;
