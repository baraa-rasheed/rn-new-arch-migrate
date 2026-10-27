import path from 'node:path';
import { exists, readJSON, readText, sha, writeJSON, writeText, walk, manifestPath, stateDir, statePath, log } from './lib/fs-utils.mjs';
import { scanAndroid, scanIOS, findLocalModules, filesToExtract, manualNative } from './lib/scan-native.mjs';
import { classify, detectIssues } from './lib/deps.mjs';
import { transform } from './lib/codemods.mjs';
import { formatPlan } from './lib/print-plan.mjs';

const SRC_IGNORE = ['node_modules', '.git', '.rn-new-arch', 'android', 'ios', 'plugins', 'build', 'dist', '.expo'];

// READ-ONLY with respect to the project. The only writes are sidecars in .rn-new-arch/
// (migration-manifest.json and plan.md). Never touches package.json, android/, ios/, or src.
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

  // Dry-run codemods to list expected breaking-change fixes (nothing written).
  const breakingExpected = [];
  for (const f of walk(cwd, { exts: ['.js', '.jsx', '.ts', '.tsx'], ignore: SRC_IGNORE })) {
    const src = readText(f); if (src === null) continue;
    const { applied } = transform(src);
    if (applied.length) breakingExpected.push({ file: path.relative(cwd, f), fixes: applied });
  }
  const native = { android, ios };
  const localModules = findLocalModules(cwd, pkg);
  const jsIssues = detectIssues(all);
  const appJson = readJSON(path.join(cwd, 'app.json'));
  const manifest = {
    version: 1, createdAt: new Date().toISOString(), projectType,
    packageJson: { name: pkg.name, main: pkg.main || null, scripts: pkg.scripts || {}, hash: sha(readText(pkgPath)) },
    versions: { reactNative: all['react-native'] || null, react: all.react || null, expo: all.expo || null },
    configs,
    configSnapshot: { appJson: appJson || null },
    native,
    extractNative: filesToExtract(native),
    localModules,
    dependencies: Object.entries(all).map(([n, v]) => classify(n, v)),
    jsIssues,
    breakingExpected,
    manual: [...jsIssues.map((i) => i.note), ...manualNative(native, localModules)],
  };
  writeJSON(manifestPath(cwd), manifest);
  writeJSON(statePath(cwd), {}); // fresh run state
  writeText(path.join(stateDir(cwd), 'plan.md'), formatPlan(manifest, { markdown: true }));
  log(`manifest → .rn-new-arch/migration-manifest.json, plan → .rn-new-arch/plan.md (${projectType}, ${manifest.dependencies.length} deps)`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = analyze(path.resolve(process.argv[2] || '.'));
  console.log(formatPlan(m));
}
