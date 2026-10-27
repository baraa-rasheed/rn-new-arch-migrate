// Quality stage: deterministic auto-fixes with existing tools only (no AI).
import path from 'node:path';
import { exists, run, log, appendReport, recordState } from './lib/fs-utils.mjs';
import { profileFromEnv } from './lib/profiles.mjs';
import { readFindings } from './lib/findings.mjs';

export function qualityFix(cwd, profile = profileFromEnv()) {
  if (!profile.stages.includes('quality')) { log(`quality: skipped (profile ${profile.id})`); return true; }
  const bin = (n) => { const p = path.join(cwd, 'node_modules', '.bin', n); return exists(p) ? p : null; };
  const done = [];
  if (run('npx', ['expo', 'install', '--fix'], cwd)) done.push('expo install --fix');
  const tools = Object.fromEntries((readFindings(cwd).tools || []).map((t) => [t.name, t.status]));
  if (bin('eslint') && tools.eslint === 'ran') { run(bin('eslint'), ['.', '--fix', '--ext', '.js,.jsx,.ts,.tsx', '--no-error-on-unmatched-pattern'], cwd); done.push('eslint --fix'); }
  if (profile.id === 'full' && bin('knip') && tools.knip === 'ran') { run(bin('knip'), ['--fix', '--fix-type', 'exports,types', '--no-progress'], cwd); done.push('knip --fix (exports,types)'); }
  if (bin('ast-grep') && exists(path.join(cwd, 'sgconfig.yml'))) { run(bin('ast-grep'), ['scan', '--update-all'], cwd); done.push('ast-grep scan --update-all (project rules)'); }
  recordState(cwd, 'quality', { done });
  appendReport(cwd, 'Quality auto-fixes', done.length ? done : ['nothing to run']);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(qualityFix(path.resolve(process.argv[2] || '.')) ? 0 : 1);
