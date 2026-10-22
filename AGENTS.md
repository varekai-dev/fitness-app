This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npm run typecheck           # typecheck; rebuilds route types first (scripts/typed-routes.js)
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building and releasing

No EAS Build (the free build quota runs out). Release APKs are built with `expo prebuild` + Gradle by `npm run build:android` (`scripts/build-android.js`, output in `dist/`). On every push to `main`, `.github/workflows/release.yml` resolves the runtime version (the native fingerprint, see `fingerprint.config.js`): if a GitHub release in `varekai-dev/fitness-app-releases` already lists it in its notes, the JS ships as an EAS Update on the `preview` channel (set for local builds via `updates.requestHeaders` in `app.json`); otherwise it builds an APK on the runner and publishes a new release. Put `[apk]` in the commit message to build an APK anyway (e.g. to replace a broken one). The app's update card (`src/components/app-update.tsx`) offers the OTA update first, then a newer APK from that repo's latest release.

The APK must be signed with the same key as the installed app, or Android refuses to install it over the old one. The key comes from `credentials.json` (downloaded with `eas credentials -p android`, gitignored) or the `ANDROID_KEYSTORE_PATH` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` env vars; in CI from repository secrets (keystore as `ANDROID_KEYSTORE_BASE64`).

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Versioning

- Before every commit, bump `expo.version` in `app.json` (semver): patch (`1.0.0` → `1.0.1`) for fixes and small changes, minor (`1.0.1` → `1.1.0`) for new features. Include the bump in the same commit. Each new version pushed to `main` becomes a release.
- Do not set `android.versionCode`: `app.config.js` derives it from `expo.version` (1.34.2 → 1034002).

## iOS Simulator

Always use the **iPhone 17 Pro Max** simulator: boot it (`xcrun simctl boot "iPhone 17 Pro Max"`) rather than whichever device happens to be open, and shut other simulators down first.

## Android Emulator

Always use the **Pixel_10_Pro_API_37.0** emulator. `npm run android` boots it (shutting other emulators down) and opens the app in Expo Go with `expo start --android` (needs `npx expo login`: Expo Go requires a signed manifest); `npm run android:build` does the same with a development build (`expo run:android`). Override the AVD with `PIXEL_AVD`.

## README screenshots

`README.md` shows screenshots from `docs/screenshots/`. When a change visibly alters one of these screens, retake that screenshot in the same commit:

| File | Screen | Route |
|---|---|---|
| `home.png` | Home tab | `/` |
| `workout.png` | Workout player (active workout) | `/workout/<id>` |
| `programs.png` | Training tab, Programs section | `/training?view=programs` |
| `program.png` | Program editor | `/program/<id>` |
| `exercises.png` | Training tab, Exercises section | `/training?view=exercises` |
| `exercise.png` | Exercise detail | `/exercise/<id>` |
| `history.png` | Training tab, History section | `/training?view=history` |
| `body-weight.png` | Body weight | `/body-weight` |
| `food.png` | Food tab | `/food` |
| `water.png` | Water tab | `/water` |

The same screens in English (app language set to English in Settings → App) live in `docs/screenshots/en/` with the same file names; the landing page's `/en/` uses them, falling back to the Ukrainian one when a file is missing. Retake the English one too when a screen changes.

Screenshots may come from either platform. On Android (Pixel emulator, app open in Expo Go via `npm run android`):

1. Clean status bar with System UI demo mode: `adb shell settings put global sysui_demo_allowed 1`, then `adb shell am broadcast -a com.android.systemui.demo -e command <cmd>` for `enter`, `clock -e hhmm 0941`, `battery -e level 100 -e plugged false`, `network -e wifi show -e level 4 -e fully true`, `network -e mobile hide` and `notifications -e visible false`.
2. Hide the floating dev tools button: open the Expo menu (`adb shell input keyevent 82`) and switch off "Tools button".
3. Open the screen: `adb reverse tcp:8081 tcp:8081`, then `adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081/--<route>" host.exp.exponent` (same `?home=1` trick for the home tab). Wait for it to load.
4. Capture and shrink to 390 px wide: `adb exec-out screencap -p > shot.png`, then `magick shot.png -resize 390x -strip docs/screenshots/<file>` (without ImageMagick on Windows, resize with `System.Drawing` in PowerShell).
5. Leave demo mode: the broadcast with `exit`.

On iOS (iPhone 17 Pro Max simulator with the app open in Expo Go and the dev server running):

1. Clean status bar: `xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularMode notSupported`.
2. Open the screen with a deep link: `xcrun simctl openurl booted "exp://<dev-server-host>:8081/--<route>"`. For the home tab add a query (`/--/?home=1`), since a bare `/` keeps the current screen. Wait for it to load.
3. Capture and shrink: `xcrun simctl io booted screenshot shot.png && magick shot.png -resize 390x -strip docs/screenshots/<file>`.
4. Reset the status bar: `xcrun simctl status_bar booted clear`.

No Expo dev overlays may be visible: the floating dev tools button and the Element Inspector must be off (restarting Expo Go clears the inspector). Look at each screenshot before committing it.
