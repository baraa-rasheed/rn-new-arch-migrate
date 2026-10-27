// Local codebase map for AI (0 tokens, never uploaded). Prefers Repomix --compress (signatures only);
// falls back to an Aider-inspired regex signature map ranked by file size. Output: .rn-new-arch/repo-map/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const MAP_CAP = 80 * 1024;
const IGNORE = ['node_modules', '.git', '.rn-new-arch', 'android', 'ios', 'build', 'dist', '.expo', 'coverage', 'web/node_modules', '.next', 'Pods'];
const IGNORE_GLOBS = '**/node_modules/**,**/.git/**,.rn-new-arch/**,android/**,ios/**,**/build/**,**/dist/**,.expo/**,coverage/**,web/node_modules/**,**/.next/**,**/Pods/**,**/*.lock,package-lock.json';
const EXT = /\.(m?[jt]sx?|cjs)$/;
const mapDir = (cwd) => path.join(cwd, '.rn-new-arch', 'repo-map');

function cap(file) {
  const buf = fs.readFileSync(file);
  if (buf.length <= MAP_CAP) return buf.length;
  fs.writeFileSync(file, buf.subarray(0, MAP_CAP).toString('utf8') + '\n\n<!-- truncated to 80KB for AI injection -->\n');
  return fs.statSync(file).size;
}

function tryRepomix(cwd, out) {
  if (process.env.RN_MIGRATE_NO_REPOMIX) return { ok: false, reason: 'disabled' };
  const r = spawnSync('npx', ['--yes', 'repomix@latest', '--compress', '--remove-comments', '--style', 'markdown', '--no-security-check',
    '--ignore', IGNORE_GLOBS, '-o', out, '--quiet', '.'], { cwd, encoding: 'utf8', timeout: 180000, env: { ...process.env, CI: '1', NO_COLOR: '1' }, shell: process.platform === 'win32' });
  if (r.status === 0 && fs.existsSync(out)) return { ok: true };
  return { ok: false, reason: (r.error?.code || r.stderr || `exit ${r.status}`).toString().slice(0, 160) };
}

function walk(cwd, dir = cwd, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(cwd, abs).split(path.sep).join('/');
    if (IGNORE.some((i) => rel === i || rel.startsWith(`${i}/`) || e.name === i)) continue;
    if (e.isDirectory()) walk(cwd, abs, acc); else if (EXT.test(e.name)) acc.push({ rel, abs, size: fs.statSync(abs).size });
  }
  return acc;
}

const SIG = /^\s*(export\s+(default\s+)?(async\s+)?(function\*?|class|const|let|interface|type|enum)\s+[\w$]+[^{=]*|(async\s+)?function\*?\s+[\w$]+\s*\([^)]*\)|class\s+[\w$]+[^{]*|export\s*\{[^}]*\}(\s*from\s*['"][^'"]+['"])?)/;
export function signatures(src) {
  const out = [];
  src.split('\n').forEach((l, i) => { const m = l.match(SIG); if (m) out.push(`L${i + 1}: ${m[0].trim().replace(/\s+/g, ' ').slice(0, 160)}`); });
  return out;
}

function fallback(cwd, out) {
  // Rank: entry/src files first, then bigger files (more likely to matter), Aider-style "important first".
  const files = walk(cwd).sort((a, b) => (/^(App|index|src\/)/.test(b.rel) - /^(App|index|src\/)/.test(a.rel)) || b.size - a.size);
  let md = `# Repo map (fallback signatures)\n\n${files.length} source files, ranked by entry/src then size.\n\n`;
  for (const f of files) {
    const sigs = signatures(fs.readFileSync(f.abs, 'utf8'));
    md += `## ${f.rel} (${f.size} B)\n${sigs.length ? sigs.map((s) => `- ${s}`).join('\n') : '- (no top-level signatures)'}\n\n`;
    if (md.length > MAP_CAP * 1.2) break;
  }
  fs.writeFileSync(out, md);
  return files;
}

export function buildRepoMap(cwd, { log = console.log } = {}) {
  const dir = mapDir(cwd); fs.mkdirSync(dir, { recursive: true });
  let mode = 'repomix', tool = 'repomix', file = path.join(dir, 'repomix-output.md'), reason;
  const r = tryRepomix(cwd, file);
  if (!r.ok) { reason = r.reason; mode = 'fallback'; tool = 'regex-signatures'; file = path.join(dir, 'signatures.md'); fallback(cwd, file); }
  const bytes = cap(file);
  const top = walk(cwd).sort((a, b) => b.size - a.size).slice(0, 25).map((f) => f.rel);
  const summary = { tool, mode, path: path.relative(cwd, file), bytes, generatedAt: new Date().toISOString(), topFiles: top, ...(reason ? { repomixError: reason } : {}) };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  log(`repo-map: ${mode} (${tool}) → ${summary.path} ${bytes} B`);
  return summary;
}

export function readRepoMap(cwd) { try { return JSON.parse(fs.readFileSync(path.join(mapDir(cwd), 'summary.json'), 'utf8')); } catch { return null; } }

// Short excerpt for prompts: pointer + top files + the map's file list (headers only) up to `max` chars.
export function mapExcerpt(cwd, max = 3000) {
  const s = readRepoMap(cwd); if (!s) return '';
  let body = ''; try { body = fs.readFileSync(path.join(cwd, s.path), 'utf8'); } catch {}
  const heads = body.split('\n').filter((l) => /^#{2,3} /.test(l)).map((l) => l.replace(/^#+\s*(File:\s*)?/, '').replace(/ \(\d+ B\)$/, '')).filter((l) => /[./]/.test(l)).join('\n');
  return `Codebase map (${s.tool}, local ${s.path}). Largest files: ${s.topFiles.slice(0, 10).join(', ')}\nFiles:\n${heads}`.slice(0, max);
}

if (import.meta.url === `file://${process.argv[1]}`) buildRepoMap(path.resolve(process.argv[2] || '.'));
