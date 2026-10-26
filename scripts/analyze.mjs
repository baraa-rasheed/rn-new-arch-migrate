import path from 'node:path';
import { exists, readJSON, readText, sha, writeJSON, manifestPath, log } from './lib/fs-utils.mjs';
import { scanAndroid, scanIOS, findLocalModules } from './lib/scan-native.mjs';
import { classify } from './lib/deps.mjs';

export function analyze(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!exists(pkgPath)) throw new Error(`No package.json in ${cwd}`);
  const pkg = readJSON(pkgPath);
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!all['react-native']) throw new Error('Not a React Native project (react-native not in dependencies)');
  const android = scanAndroid(cwd), ios = scanIOS(cwd);
  const projectType = !all.expo ? 'bare-rn-cli' : (android || ios) ? 'expo-bare' : 'expo-managed';
  const configs = ['app.json', 'app.config.js', 'app.config.ts', 'babel.config.js', 'metro.config.js', 'tsconfig.json', 'react-native.config.js', 'index.js', 'index.ts', 'eas.json']
    .filter((f) => exists(path.join(cwd, f)));
  const manifest = {
    version: 1, createdAt: new Date().toISOString(), projectType,
    packageJson: { name: pkg.name, main: pkg.main || null, scripts: pkg.scripts || {}, hash: sha(readText(pkgPath)) },
    versions: { reactNative: all['react-native'] || null, react: all.react || null, expo: all.expo || null },
    configs,
    native: { android, ios },
    localModules: findLocalModules(cwd, pkg),
    dependencies: Object.entries(all).map(([n, v]) => classify(n, v)),
  };
  writeJSON(manifestPath(cwd), manifest);
  const rep = manifest.dependencies.filter((d) => d.status === 'replace');
  log(`manifest → ${path.relative(cwd, manifestPath(cwd))} (${projectType}, ${manifest.dependencies.length} deps, ${rep.length} to replace)`);
  for (const d of rep) log(`  replace ${d.name} → ${d.replacement}${d.note ? ` (${d.note})` : ''}`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) analyze(path.resolve(process.argv[2] || '.'));
