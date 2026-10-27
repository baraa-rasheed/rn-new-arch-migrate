import path from 'node:path';
import fs from 'node:fs';
import { exists, readJSON, readText, writeJSON, writeText, copyDir, manifestPath, stateDir, run, log, appendReport, recordState } from './lib/fs-utils.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TMPL = path.resolve(HERE, '../templates/plugins/restore-native-overlay.js.tmpl');

export function generate(cwd) {
  const manifest = readJSON(manifestPath(cwd));
  if (!manifest) throw new Error('Run analyze first');
  const a = manifest.native.android || {}, i = manifest.native.ios || {};

  // 1. Full backup + extract custom native files BEFORE prebuild --clean wipes them.
  const backup = path.join(stateDir(cwd), 'backup');
  for (const d of ['android', 'ios']) {
    if (exists(path.join(cwd, d)) && !exists(path.join(backup, d))) { copyDir(path.join(cwd, d), path.join(backup, d)); log(`backed up ${d}/`); }
  }
  const extractDir = path.join(stateDir(cwd), 'extracted-native');
  const extracted = [];
  for (const rel of manifest.extractNative || []) {
    const src = path.join(cwd, rel);
    if (!exists(src)) continue;
    fs.mkdirSync(path.dirname(path.join(extractDir, rel)), { recursive: true });
    fs.copyFileSync(src, path.join(extractDir, rel));
    extracted.push(rel);
  }
  log(`extracted ${extracted.length} native file(s) → .rn-new-arch/extracted-native/`);

  // 2. Generate the restore plugin from the manifest.
  const restorable = (f) => !/(AndroidManifest\.xml|build\.gradle(\.kts)?|Podfile|AppDelegate\.\w+|gradle\.properties)$/.test(f) && !/^android\/build\.gradle$/.test(f);
  const overlay = {
    androidPermissions: a.permissions || [],
    androidMetaData: a.metaData || [],
    gradleExtras: (a.gradleExtras || []).filter((l) => /^(implementation|api)\s/.test(l)),
    infoPlist: i.infoPlist || {},
    urlSchemes: i.urlSchemes || [],
    backgroundModes: i.backgroundModes || [],
    queriesSchemes: i.queriesSchemes || [],
    podExtras: (i.podExtras || []).filter((l) => /^pod\s/.test(l)),
    files: { android: extracted.filter((f) => f.startsWith('android/') && restorable(f)), ios: extracted.filter((f) => f.startsWith('ios/') && restorable(f)) },
  };
  writeText(path.join(cwd, 'plugins/restore-native-overlay.js'), readText(TMPL).replace('__OVERLAY_JSON__', JSON.stringify(overlay, null, 2)));
  const appPath = path.join(cwd, 'app.json');
  const app = readJSON(appPath, { expo: {} });
  app.expo.plugins = Array.from(new Set([...(app.expo.plugins || []), './plugins/restore-native-overlay.js']));
  writeJSON(appPath, app);

  // 3. Regenerate android/ + ios/ from scratch.
  const ok = run('npx', ['expo', 'prebuild', '--clean', '--no-install'], cwd);
  if (ok && process.platform === 'darwin') run('npx', ['pod-install'], cwd);

  const plugged = [
    overlay.androidPermissions.length && `Android permissions (${overlay.androidPermissions.length}) → withAndroidManifest`,
    overlay.androidMetaData.length && `Android <meta-data> (${overlay.androidMetaData.length}) → withAndroidManifest`,
    overlay.gradleExtras.length && `build.gradle dependencies (${overlay.gradleExtras.length}) → withAppBuildGradle`,
    Object.keys(overlay.infoPlist).length && `Info.plist usage keys (${Object.keys(overlay.infoPlist).length}) → withInfoPlist`,
    overlay.urlSchemes.length && `URL schemes → withInfoPlist`,
    overlay.backgroundModes.length && `UIBackgroundModes → withInfoPlist`,
    overlay.podExtras.length && `Podfile pods (${overlay.podExtras.length}) → withPodfile`,
    (overlay.files.android.length + overlay.files.ios.length) && `${overlay.files.android.length + overlay.files.ios.length} custom source/resource file(s) copied back → withDangerousMod`,
  ].filter(Boolean);
  const skippedGradle = (a.gradleExtras || []).filter((l) => !overlay.gradleExtras.includes(l));
  const skippedPod = (i.podExtras || []).filter((l) => !overlay.podExtras.includes(l));
  const manual = [
    ...skippedGradle.map((l) => `build.gradle line not auto-restored: \`${l}\` (use expo-build-properties or withAppBuildGradle)`),
    ...skippedPod.map((l) => `Podfile line not auto-restored: \`${l}\` (use expo-build-properties or withPodfile)`),
  ];
  recordState(cwd, 'generate', { prebuild: ok, extracted, plugged, manual });
  const lines = [ok ? 'expo prebuild --clean succeeded (android/ + ios/ regenerated from Expo SDK 58 templates)' : 'expo prebuild FAILED; see output', ...plugged, ...manual];
  lines.push('Android R8 minify is on by default; add keep rules via expo-build-properties if reflection breaks');
  appendReport(cwd, 'Generate (extract → plugin → prebuild)', lines);
  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) generate(path.resolve(process.argv[2] || '.'));
