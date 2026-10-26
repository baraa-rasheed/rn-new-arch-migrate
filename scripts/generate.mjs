import path from 'node:path';
import fs from 'node:fs';
import { exists, readJSON, readText, writeJSON, writeText, copyDir, manifestPath, stateDir, run, log, appendReport } from './lib/fs-utils.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TMPL = path.resolve(HERE, '../templates/plugins/restore-native-overlay.js.tmpl');

export function generate(cwd) {
  const manifest = readJSON(manifestPath(cwd));
  const backup = path.join(stateDir(cwd), 'backup');
  for (const d of ['android', 'ios']) {
    if (exists(path.join(cwd, d)) && !exists(path.join(backup, d))) { copyDir(path.join(cwd, d), path.join(backup, d)); log(`backed up ${d}/`); }
  }
  const overlay = {
    androidPermissions: manifest.native.android?.permissions || [],
    infoPlist: manifest.native.ios?.infoPlist || {},
    files: { android: manifest.native.android?.customFiles || [], ios: manifest.native.ios?.customFiles || [] },
  };
  writeText(path.join(cwd, 'plugins/restore-native-overlay.js'), readText(TMPL).replace('__OVERLAY_JSON__', JSON.stringify(overlay, null, 2)));
  const appPath = path.join(cwd, 'app.json');
  const app = readJSON(appPath, { expo: {} });
  app.expo.plugins = Array.from(new Set([...(app.expo.plugins || []), './plugins/restore-native-overlay.js']));
  writeJSON(appPath, app);

  const ok = run('npx', ['expo', 'prebuild', '--clean', '--no-install'], cwd);
  if (ok && process.platform === 'darwin') run('npx', ['pod-install'], cwd);
  const lines = [ok ? 'expo prebuild --clean succeeded (android/ + ios/ regenerated from Expo SDK 58 templates)' : 'expo prebuild FAILED; see output'];
  if (overlay.files.ios.some((f) => f.endsWith('.swift') || f.endsWith('.m') || f.endsWith('.mm'))) lines.push('Custom iOS sources restored; add them to the Xcode target via a plugin or convert to an Expo Module');
  if (overlay.files.android.length) lines.push('Custom Android sources restored; register packages via an Expo Module or withMainApplication');
  lines.push('Android R8 minify is on by default; add keep rules via expo-build-properties if reflection breaks');
  appendReport(cwd, 'Generate (prebuild)', lines);
  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) generate(path.resolve(process.argv[2] || '.'));
