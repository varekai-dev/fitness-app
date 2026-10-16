/**
 * The fingerprint is the runtime version, and EAS Update only reaches builds with a
 * matching one. `expo.version` is bumped on every commit, so it must stay out of the
 * fingerprint: otherwise every push needs a new APK and no build ever gets an update.
 * Setting `sourceSkips` replaces the default, so the default skip is kept as well.
 * @type {import('@expo/fingerprint').Config}
 */
const config = {
  sourceSkips: ['ExpoConfigVersions', 'PackageJsonAndroidAndIosScriptsIfNotContainRun'],
};

module.exports = config;
