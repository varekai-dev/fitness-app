#!/usr/bin/env node
/**
 * Runs the app on the Pixel Android emulator, whatever else is open.
 *
 *   node scripts/android-pixel.js        Expo Go: dev server + open on the Pixel
 *   node scripts/android-pixel.js build  development build (expo run:android)
 *
 * Other running emulators are shut down first so Expo cannot pick the wrong one.
 * Override the emulator with the PIXEL_AVD environment variable.
 */
const { execFileSync, spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const AVD = process.env.PIXEL_AVD || 'Pixel_10_Pro_API_37.0';
const BOOT_TIMEOUT_MS = 180_000;

const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Android', 'sdk')
      : path.join(os.homedir(), 'Android', 'Sdk'));
const adbPath = path.join(sdk, 'platform-tools', 'adb');
const emulatorPath = path.join(sdk, 'emulator', 'emulator');

const adb = (...args) =>
  execFileSync(adbPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Serial → AVD name for every running emulator. */
function runningEmulators() {
  return adb('devices')
    .split('\n')
    .map((line) => line.split('\t')[0].trim())
    .filter((serial) => serial.startsWith('emulator-'))
    .map((serial) => {
      let name = '';
      try {
        name = adb('-s', serial, 'emu', 'avd', 'name').split('\n')[0].trim();
      } catch {}
      return { serial, name };
    });
}

async function ensurePixel() {
  const avds = execFileSync(emulatorPath, ['-list-avds'], { encoding: 'utf8' });
  if (!avds.split(/\r?\n/).includes(AVD)) {
    throw new Error(`AVD "${AVD}" not found. Available:\n${avds}`);
  }

  let pixel;
  for (const emu of runningEmulators()) {
    if (emu.name === AVD) {
      pixel = emu.serial;
    } else {
      console.log(`› Shutting down ${emu.name || emu.serial}`);
      adb('-s', emu.serial, 'emu', 'kill');
    }
  }

  if (!pixel) {
    console.log(`› Starting ${AVD}`);
    spawn(emulatorPath, ['-avd', AVD], { detached: true, stdio: 'ignore' }).unref();
  }

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    pixel = runningEmulators().find((e) => e.name === AVD)?.serial;
    if (pixel) {
      try {
        if (adb('-s', pixel, 'shell', 'getprop', 'sys.boot_completed') === '1') return pixel;
      } catch {}
    }
    await sleep(2000);
  }
  throw new Error(`${AVD} did not finish booting in ${BOOT_TIMEOUT_MS / 1000}s`);
}

async function main() {
  const mode = process.argv[2] === 'build' ? 'build' : 'go';
  const serial = await ensurePixel();
  console.log(`› ${AVD} is ready (${serial})`);

  const args =
    mode === 'build'
      ? ['expo', 'run:android', '--device', AVD]
      : // Expo Go needs a signed manifest: be logged in (`npx expo login`), or it times out.
        ['expo', 'start', '--android'];
  const child = spawn('npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ANDROID_SERIAL: serial },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
