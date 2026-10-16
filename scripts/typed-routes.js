// Rebuilds .expo/types/router.d.ts from a full scan of src/app.
//
// Metro's incremental watcher writes broken route types on Windows: it compares
// backslash paths against '../', so files outside src/app become routes
// ("/../lib/i18n") and a new settings\index.tsx never folds into "/settings".
// `npm run typecheck` regenerates the file from scratch before running tsc.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const typesDir = path.join(root, '.expo', 'types');
process.env.EXPO_ROUTER_APP_ROOT = path.join(root, 'src', 'app');

// Resolved the way Expo CLI resolves them, so the generator matches `expo start`.
const cli = path.dirname(
  require.resolve('@expo/cli/package.json', { paths: [require.resolve('expo/package.json')] }),
);
const load = (id) => require(require.resolve(id, { paths: [cli] }));
const { getTypedRoutesDeclarationFile } = load('@expo/router-server/build/typed-routes/generate');
const { requireContext } = load('expo-router/internal/testing');
const { EXPO_ROUTER_CTX_IGNORE } = load('expo-router/_ctx-shared');

const ctx = requireContext(process.env.EXPO_ROUTER_APP_ROOT, true, EXPO_ROUTER_CTX_IGNORE);
const file = getTypedRoutesDeclarationFile(ctx, {});
if (!file) throw new Error('Typed routes: no declarations generated');

fs.mkdirSync(typesDir, { recursive: true });
fs.writeFileSync(path.join(typesDir, 'router.d.ts'), file);
