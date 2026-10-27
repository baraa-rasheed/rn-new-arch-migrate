import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const exists = (p) => fs.existsSync(p);
export const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
export const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); };
export const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
export const writeText = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const stateDir = (cwd) => path.join(cwd, '.rn-new-arch');
export const manifestPath = (cwd) => path.join(stateDir(cwd), 'migration-manifest.json');
export const log = (...a) => console.log('[rn→expo58]', ...a);

export function walk(dir, { exts = null, ignore = ['node_modules', '.git', '.rn-new-arch', 'Pods', 'build', '.gradle', 'DerivedData'] } = {}, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, { exts, ignore }, out);
    else if (!exts || exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}

export function run(cmd, args, cwd, { allowFail = true } = {}) {
  log('$', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.join(' ')} failed`);
  return r.status === 0;
}

export function copyDir(src, dst) { if (exists(src)) fs.cpSync(src, dst, { recursive: true }); }

export function appendReport(cwd, section, lines) {
  const p = path.join(stateDir(cwd), 'report.md');
  const prev = readText(p) || '# rn-new-arch-migrate report (Expo SDK 58)\n';
  writeText(p, prev + `\n## ${section}\n` + lines.map((l) => `- ${l}`).join('\n') + '\n');
}

// Structured run state used to build MIGRATION.md.
export const statePath = (cwd) => path.join(stateDir(cwd), 'state.json');
export function recordState(cwd, key, value) {
  const st = readJSON(statePath(cwd), {});
  st[key] = value; writeJSON(statePath(cwd), st);
}
export const readState = (cwd) => readJSON(statePath(cwd), {});
