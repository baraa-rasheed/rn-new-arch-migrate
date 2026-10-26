import path from 'node:path';
import { exists, readJSON, writeJSON, readText, writeText, log } from './fs-utils.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TEMPLATE = path.resolve(HERE, '../../templates/app.json.expo58.json');

export function ensureAppJson(cwd, manifest) {
  const p = path.join(cwd, 'app.json');
  const name = manifest.packageJson.name || 'App';
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const fallbackId = `com.${slug.replace(/-/g, '')}`;
  const cur = readJSON(p, {});
  const tpl = JSON.parse(readText(TEMPLATE)
    .replace('__NAME__', cur.displayName || name).replace('__SLUG__', slug)
    .replace('__IOS_ID__', manifest.native.ios?.bundleIdentifier || fallbackId)
    .replace('__ANDROID_ID__', manifest.native.android?.applicationId || fallbackId));
  tpl.expo.plugins = [];
  const expo = { ...tpl.expo, ...(cur.expo || {}) };
  expo.ios = { ...tpl.expo.ios, ...(cur.expo?.ios || {}) };
  expo.android = { ...tpl.expo.android, ...(cur.expo?.android || {}) };
  writeJSON(p, { expo });
  log('app.json ready');
}

export function rewritePackageJson(cwd) {
  const p = path.join(cwd, 'package.json');
  const pkg = readJSON(p);
  pkg.scripts = { ...pkg.scripts, start: 'expo start', android: 'expo run:android', ios: 'expo run:ios', web: 'expo start --web', prebuild: 'expo prebuild --clean', doctor: 'npx expo-doctor' };
  const idx = ['index.js', 'index.ts', 'index.tsx'].find((f) => exists(path.join(cwd, f)));
  pkg.main = idx || 'expo/AppEntry';
  pkg.engines = { ...(pkg.engines || {}), node: '>=22.13' };
  writeJSON(p, pkg);
}

export function rewriteEntry(cwd) {
  for (const f of ['index.js', 'index.ts', 'index.tsx']) {
    const p = path.join(cwd, f); const s = readText(p);
    if (!s || !/AppRegistry\.registerComponent/.test(s)) continue;
    const m = s.match(/AppRegistry\.registerComponent\([^,]+,\s*\(\)\s*=>\s*(\w+)\)/);
    let out = s.replace(/import\s*\{\s*AppRegistry\s*\}\s*from\s*['"]react-native['"];?\n?/, '')
      .replace(/import\s*\{\s*name\s+as\s+appName\s*\}\s*from\s*['"]\.\/app\.json['"];?\n?/, '');
    out = out.replace(/AppRegistry\.registerComponent\([^;]*\);?/, m ? `registerRootComponent(${m[1]});` : '// TODO(expo58): call registerRootComponent(App)');
    out = `import { registerRootComponent } from 'expo';\n` + out;
    writeText(p, out); log('entry →', f);
  }
}

export function rewriteBabel(cwd) {
  const p = path.join(cwd, 'babel.config.js'); const s = readText(p);
  if (s === null) { writeText(p, `module.exports = function (api) {\n  api.cache(true);\n  return { presets: ['babel-preset-expo'] };\n};\n`); return; }
  writeText(p, s.replace(/['"](module:)?(metro-react-native-babel-preset|@react-native\/babel-preset)['"]/g, "'babel-preset-expo'"));
}

export function rewriteMetro(cwd) {
  const p = path.join(cwd, 'metro.config.js'); const s = readText(p);
  if (s && /expo\/metro-config/.test(s)) return;
  if (s) writeText(p + '.pre-expo58.bak', s);
  writeText(p, `const { getDefaultConfig } = require('expo/metro-config');\n\nmodule.exports = getDefaultConfig(__dirname);\n`);
}
