import path from 'node:path';
import { readJSON, writeJSON, manifestPath, run, log, appendReport } from './lib/fs-utils.mjs';
import { ensureAppJson, rewritePackageJson, rewriteEntry, rewriteBabel, rewriteMetro } from './lib/bare-to-expo.mjs';
import { SDK } from './lib/deps.mjs';

export function migrate(cwd) {
  const manifest = readJSON(manifestPath(cwd));
  if (!manifest) throw new Error('Run analyze first');
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 22 || (maj === 22 && min < 13)) log(`WARNING: Node ${process.versions.node} < 22.13 required by Expo SDK 58`);

  // 1. Remove CLI-only and replaced deps from package.json; add expo.
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = readJSON(pkgPath);
  const toInstall = new Set(['expo', 'react', 'react-native', 'babel-preset-expo', 'expo-status-bar']);
  const report = [];
  for (const d of manifest.dependencies) {
    if (d.status === 'remove' || d.status === 'replace') {
      delete pkg.dependencies?.[d.name]; delete pkg.devDependencies?.[d.name];
      report.push(d.status === 'remove' ? `removed ${d.name} (${d.note})` : `replaced ${d.name} → ${d.replacement}${d.note ? ` (${d.note})` : ''}`);
      if (d.replacement) toInstall.add(d.replacement);
    }
  }
  pkg.dependencies = { ...pkg.dependencies, expo: SDK.expo };
  writeJSON(pkgPath, pkg);

  // 2. Bare → Expo conversion.
  ensureAppJson(cwd, manifest);
  rewritePackageJson(cwd);
  rewriteEntry(cwd);
  rewriteBabel(cwd);
  rewriteMetro(cwd);

  // 3. Resolve SDK 58 versions.
  run('npm', ['install', '--legacy-peer-deps'], cwd);
  run('npx', ['expo', 'install', `expo@${SDK.expo}`, '--', '--legacy-peer-deps'], cwd);
  run('npx', ['expo', 'install', ...toInstall], cwd);
  const fixed = run('npx', ['expo', 'install', '--fix'], cwd);
  report.push(fixed ? 'expo install --fix aligned all SDK packages to SDK 58' : 'expo install --fix FAILED; rerun manually');

  // 4. Upgrade non-SDK packages to latest, flagging failures.
  const after = readJSON(pkgPath);
  const check = run('npx', ['expo', 'install', '--check'], cwd);
  if (!check) report.push('expo install --check reports mismatches; see output');
  for (const n of Object.keys(after.dependencies || {})) {
    if (/^(expo|react|react-native|react-dom)$/.test(n) || n.startsWith('expo-') || n.startsWith('@expo/')) continue;
    if (!run('npx', ['expo', 'install', n], cwd)) report.push(`FLAG: could not upgrade ${n}; check RN 0.88 / New Architecture support`);
  }
  appendReport(cwd, 'Migrate (bare → Expo 58, deps)', report);
}

if (import.meta.url === `file://${process.argv[1]}`) migrate(path.resolve(process.argv[2] || '.'));
