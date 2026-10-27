import path from 'node:path';
import { exists, run, appendReport, log, stateDir, recordState } from './lib/fs-utils.mjs';
import { writeReport } from './lib/write-report.mjs';

export function verify(cwd, { skipGenerate = false, report = true } = {}) {
  const checks = [];
  const add = (name, status, note = '') => checks.push({ name, status, note });
  add('npx expo-doctor', run('npx', ['--yes', 'expo-doctor'], cwd) ? 'PASS' : 'FAIL');
  if (exists(path.join(cwd, 'tsconfig.json'))) add('npx tsc --noEmit', run('npx', ['tsc', '--noEmit'], cwd) ? 'PASS' : 'FAIL');
  else add('npx tsc --noEmit', 'SKIP', 'no tsconfig.json');
  add('npx expo export --platform all (JS bundles iOS + Android)', run('npx', ['expo', 'export', '--platform', 'all', '--output-dir', path.join(stateDir(cwd), 'export')], cwd) ? 'PASS' : 'FAIL');
  if (!skipGenerate) {
    add('android/ exists after prebuild', exists(path.join(cwd, 'android')) ? 'PASS' : 'FAIL');
    add('ios/ exists after prebuild', exists(path.join(cwd, 'ios')) ? 'PASS' : 'FAIL');
  } else add('native projects', 'SKIP', '--skip-generate');
  // Native builds: only claim success when actually run.
  const native = process.env.RN_MIGRATE_NATIVE_BUILD === '1';
  if (native && !skipGenerate) {
    add('npx expo run:android --no-install --no-bundler', run('npx', ['expo', 'run:android', '--no-install', '--no-bundler'], cwd) ? 'PASS' : 'FAIL');
    if (process.platform === 'darwin') add('npx expo run:ios --no-install --no-bundler', run('npx', ['expo', 'run:ios', '--no-install', '--no-bundler'], cwd) ? 'PASS' : 'FAIL');
    else add('npx expo run:ios', 'PENDING', 'requires macOS; use `eas build -p ios`');
  } else {
    add('Native build iOS', 'PENDING', 'run `npx expo run:ios` or `eas build -p ios --profile development` (set RN_MIGRATE_NATIVE_BUILD=1 to run locally)');
    add('Native build Android', 'PENDING', 'run `npx expo run:android` or `eas build -p android --profile development`');
  }
  const failed = checks.some((c) => c.status === 'FAIL');
  const pending = checks.some((c) => c.status === 'PENDING');
  const verdict = failed ? 'FAIL' : pending ? 'PASS (static checks) — native build pending' : 'PASS';
  recordState(cwd, 'verify', { checks, verdict });
  appendReport(cwd, 'Verify', checks.map((c) => `${c.name}: ${c.status}${c.note ? ` (${c.note})` : ''}`));
  if (report) writeReport(cwd);
  log(`verify: ${verdict}; see MIGRATION.md`);
  return !failed;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(verify(path.resolve(process.argv[2] || '.')) ? 0 : 1);
