#!/usr/bin/env node
/**
 * Builds a signed release APK locally, without EAS: `expo prebuild` + Gradle.
 *
 *   npm run build:android      → dist/fitness-<version>.apk
 *
 * Signing (the same key as the installed app, or Android refuses the update), from either:
 *   - credentials.json in the project root, as downloaded by `eas credentials -p android`
 *   - env: ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
 * Needs a JDK (17+) and the Android SDK (ANDROID_HOME).
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');
const isWindows = process.platform === 'win32';

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function signing() {
  const credentialsFile = path.join(root, 'credentials.json');
  if (fs.existsSync(credentialsFile)) {
    const { keystore } = JSON.parse(fs.readFileSync(credentialsFile, 'utf8')).android;
    return {
      storeFile: path.resolve(root, keystore.keystorePath),
      storePassword: keystore.keystorePassword,
      keyAlias: keystore.keyAlias,
      keyPassword: keystore.keyPassword,
    };
  }
  const env = process.env;
  const missing = [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ].filter((name) => !env[name]);
  if (missing.length) {
    console.error(`No credentials.json and no signing env (${missing.join(', ')}).`);
    process.exit(1);
  }
  return {
    storeFile: path.resolve(env.ANDROID_KEYSTORE_PATH),
    storePassword: env.ANDROID_KEYSTORE_PASSWORD,
    keyAlias: env.ANDROID_KEY_ALIAS,
    keyPassword: env.ANDROID_KEY_PASSWORD,
  };
}

/** Backslash is the escape character in .properties files. */
const prop = (value) => value.replaceAll('\\', '\\\\');

const keys = signing();
if (!fs.existsSync(keys.storeFile)) {
  console.error(`Keystore not found: ${keys.storeFile}`);
  process.exit(1);
}
const { version } = require(path.join(root, 'app.json')).expo;

run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean']);

// android/ is regenerated above, so the signing settings never outlive this build.
// The injected properties override the debug signing config the template gives release builds.
// The template's 2 GB heap runs out while merging dex files; the last value in the file wins.
fs.appendFileSync(
  path.join(androidDir, 'gradle.properties'),
  [
    '',
    'org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g',
    `android.injected.signing.store.file=${keys.storeFile.replaceAll('\\', '/')}`,
    `android.injected.signing.store.password=${prop(keys.storePassword)}`,
    `android.injected.signing.key.alias=${prop(keys.keyAlias)}`,
    `android.injected.signing.key.password=${prop(keys.keyPassword)}`,
    '',
  ].join('\n'),
);

run(
  path.join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew'),
  ['app:assembleRelease'],
  androidDir,
);

const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const out = path.join(root, 'dist', `fitness-${version}.apk`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(apk, out);
console.log(`\n› ${path.relative(root, out)}`);
