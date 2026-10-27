import path from 'node:path';
import { readJSON, writeJSON, manifestPath, run, log, appendReport, recordState } from './lib/fs-utils.mjs';
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
  const before = { ...pkg.devDependencies, ...pkg.dependencies };
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

  // 3. Resolve SDK 58 versions: install expo@^58 first, then let Expo pick exact versions.
  run('npm', ['install', '--legacy-peer-deps'], cwd);
  const expoOk = run('npx', ['expo', 'install', `expo@${SDK.expo}`, '--', '--legacy-peer-deps'], cwd);
  report.push(expoOk ? `npx expo install expo@${SDK.expo} succeeded` : `npx expo install expo@${SDK.expo} FAILED`);
  const replacements = [...toInstall].filter((n) => n !== 'expo');
  run('npx', ['expo', 'install', ...replacements], cwd);
  const fixed = run('npx', ['expo', 'install', '--fix'], cwd);
  report.push(fixed ? 'npx expo install --fix aligned all SDK packages to SDK 58' : 'npx expo install --fix FAILED; rerun manually');

  // 4. Upgrade non-SDK packages to latest, flagging failures.
  const after = readJSON(pkgPath);
  const check = run('npx', ['expo', 'install', '--check'], cwd);
  if (!check) report.push('expo install --check reports mismatches; see output');
  for (const n of Object.keys(after.dependencies || {})) {
    if (/^(expo|react|react-native|react-dom)$/.test(n) || n.startsWith('expo-') || n.startsWith('@expo/')) continue;
    if (!run('npx', ['expo', 'install', n], cwd)) report.push(`FLAG: could not upgrade ${n}; check RN 0.88 / New Architecture support`);
  }
  // 5. Final pass so nothing drifted from the SDK 58 table.
  run('npx', ['expo', 'install', '--fix'], cwd);
  const final = readJSON(pkgPath);
  const now = { ...final.devDependencies, ...final.dependencies };
  const upgraded = Object.keys(now).filter((n) => before[n] && before[n] !== now[n]).map((n) => `${n}: ${before[n]} → ${now[n]}`);
  const added = Object.keys(now).filter((n) => !before[n]).map((n) => `${n}@${now[n]}`);
  recordState(cwd, 'migrate', {
    upgraded, added, resolution: { expo: expoOk, fix: fixed, check },
    replaced: manifest.dependencies.filter((d) => d.status === 'replace').map((d) => `${d.name} → ${d.replacement}`),
    removed: manifest.dependencies.filter((d) => d.status === 'remove').map((d) => `${d.name} (${d.note})`),
    flags: report.filter((l) => l.startsWith('FLAG')),
  });
  appendReport(cwd, 'Migrate (bare → Expo 58, deps)', report);
}

if (import.meta.url === `file://${process.argv[1]}`) migrate(path.resolve(process.argv[2] || '.'));
