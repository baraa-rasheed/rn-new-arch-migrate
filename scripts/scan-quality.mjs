// Local quality scan (0 AI tokens). Wraps existing tools as-is; every tool is optional and is
// recorded as ran/skipped/failed instead of failing the scan. Writes .rn-new-arch/findings.json
// and appends the findings section to .rn-new-arch/plan.md. Never modifies project sources.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists, readJSON, readText, walk, manifestPath, stateDir, log, writeText } from './lib/fs-utils.mjs';
import { makeFinding, dedupe, summarize, writeFindings, expectedGains, formatFindings } from './lib/findings.mjs';
import { resolveProfile, profileFromEnv } from './lib/profiles.mjs';
import { buildRepoMap } from './lib/repo-map.mjs';

const SRC_IGNORE = ['node_modules', '.git', '.rn-new-arch', 'android', 'ios', 'plugins', 'build', 'dist', '.expo', 'coverage'];
const rel = (cwd, f) => (f ? path.relative(cwd, path.resolve(cwd, f)) : null);
const localBin = (cwd, name) => { const p = path.join(cwd, 'node_modules', '.bin', name); return exists(p) ? p : null; };

function exec(cmd, args, cwd, timeout = 180000) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' }, shell: process.platform === 'win32' });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', error: r.error };
}
const parseJSON = (s) => { try { return JSON.parse(s); } catch { const i = s.search(/[[{]/); try { return i >= 0 ? JSON.parse(s.slice(i)) : null; } catch { return null; } } };

// ---- tool wrappers: each returns { status, reason?, findings: [] }
function expoDoctor(cwd, all) {
  if (!all.expo) return { status: 'skipped', reason: 'not an Expo project yet (runs again in verify)', findings: [] };
  const bin = localBin(cwd, 'expo-doctor');
  const r = bin ? exec(bin, [], cwd) : exec('npx', ['--yes', 'expo-doctor'], cwd);
  if (r.error) return { status: 'skipped', reason: r.error.code || 'unavailable', findings: [] };
  const findings = (r.out + r.err).split('\n').filter((l) => /✖|check failed|Failed:/i.test(l)).map((l) => {
    const msg = l.replace(/^[\s✖×-]+/, '').trim();
    return makeFinding({ tool: 'expo-doctor', rule: msg.split(/[:.]/)[0].slice(0, 60), severity: 'error', message: msg, snippet: msg,
      fixability: /depend|version|install/i.test(msg) ? 'auto' : 'manual', category: /native|prebuild|config plugin/i.test(msg) ? 'native' : 'upgrade' });
  });
  return { status: 'ran', findings };
}

function eslint(cwd, pkg) {
  const bin = localBin(cwd, 'eslint');
  const cfg = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs'].some((f) => exists(path.join(cwd, f))) || pkg.eslintConfig;
  if (!bin) return { status: 'skipped', reason: 'eslint not installed in project', findings: [] };
  if (!cfg) return { status: 'skipped', reason: 'no eslint config', findings: [] };
  const r = exec(bin, ['.', '--format', 'json', '--ext', '.js,.jsx,.ts,.tsx', '--no-error-on-unmatched-pattern'], cwd);
  const json = parseJSON(r.out);
  if (!Array.isArray(json)) return { status: 'failed', reason: (r.err || 'unparseable output').split('\n')[0].slice(0, 160), findings: [] };
  const findings = [];
  for (const file of json) for (const m of file.messages || []) {
    const perf = /perf|no-inline-styles|no-unstable-nested-components|exhaustive-deps|no-array-index-key/i.test(m.ruleId || '');
    findings.push(makeFinding({ tool: 'eslint', rule: m.ruleId || 'parse', file: rel(cwd, file.filePath), line: m.line, severity: m.severity === 2 ? 'error' : 'warning',
      message: m.message, snippet: `${m.ruleId}:${m.message}:${m.line}`, fixability: m.fix ? 'auto' : m.ruleId ? 'ai' : 'manual', category: perf ? 'perf' : 'lint' }));
  }
  return { status: 'ran', findings };
}

function knip(cwd) {
  const bin = localBin(cwd, 'knip');
  if (!bin) return { status: 'skipped', reason: 'knip not installed in project', findings: [] };
  const r = exec(bin, ['--reporter', 'json', '--no-progress'], cwd);
  const json = parseJSON(r.out);
  if (!json) return { status: 'failed', reason: (r.err || 'unparseable output').split('\n')[0].slice(0, 160), findings: [] };
  const findings = (json.files || []).map((f) => makeFinding({ tool: 'knip', rule: 'unused-file', file: f, severity: 'info', message: 'Unused file', snippet: f, fixability: 'manual', category: 'bundle' }));
  for (const is of json.issues || []) for (const [type, items] of Object.entries(is)) {
    if (!Array.isArray(items)) continue;
    for (const it of items) findings.push(makeFinding({ tool: 'knip', rule: `unused-${type}`, file: is.file, line: it.line, severity: 'info', message: `Unused ${type}: ${it.name}`, snippet: `${type}:${it.name}`,
      fixability: /dependencies|exports|types/.test(type) ? 'auto' : 'manual', category: /dependencies/.test(type) ? 'bundle' : 'lint' }));
  }
  return { status: 'ran', findings };
}

// react-doctor is opt-in (license: Modified MIT). Always --no-telemetry.
function reactDoctor(cwd) {
  const bin = localBin(cwd, 'react-doctor');
  const r = bin ? exec(bin, ['--json', '--no-telemetry'], cwd) : exec('npx', ['--yes', 'react-doctor', '--json', '--no-telemetry'], cwd);
  if (r.error) return { status: 'skipped', reason: r.error.code || 'unavailable', findings: [] };
  const json = parseJSON(r.out);
  if (!json) return { status: 'failed', reason: 'no JSON output', findings: [] };
  const items = []; const seen = new Set();
  (function dig(o) { if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
    if (!Array.isArray(o) && (o.message || o.description) && (o.file || o.filePath || o.path)) items.push(o);
    for (const v of Object.values(o)) dig(v); })(json);
  const findings = items.map((i) => makeFinding({ tool: 'react-doctor', rule: i.rule || i.ruleId || i.id || i.category || 'diagnostic', file: rel(cwd, i.file || i.filePath || i.path), line: i.line || i.startLine,
    severity: /error|critical/i.test(i.severity || '') ? 'error' : 'warning', message: i.message || i.description, snippet: JSON.stringify(i).slice(0, 300),
    fixability: 'ai', category: /perf|render|memo|bundle/i.test(`${i.category} ${i.rule}`) ? 'perf' : 'lint' }));
  return { status: 'ran', findings };
}

// 0-token regex heuristics for common RN bad practices (lightweight; ast-grep can replace later).
const HEURISTICS = [
  { rule: 'console-in-source', re: /\bconsole\.(log|debug|info)\(/, category: 'perf', fix: 'manual', msg: 'console.* in app code (strip in production via babel-plugin-transform-remove-console)' },
  { rule: 'scrollview-map', re: /<ScrollView[\s\S]{0,400}?\.map\(/, multi: true, category: 'perf', fix: 'ai', msg: 'ScrollView rendering .map(): use FlatList/FlashList for long lists', gain: 'Virtualized list: lower memory and faster scroll' },
  { rule: 'animated-js-driver', re: /useNativeDriver:\s*false/, category: 'perf', fix: 'ai', msg: 'Animated with useNativeDriver:false runs on the JS thread' },
  { rule: 'full-lodash-import', re: /from\s+['"]lodash['"]|require\(['"]lodash['"]\)/, category: 'bundle', fix: 'ai', msg: 'Full lodash import: use per-method imports or native JS' },
  { rule: 'moment-import', re: /from\s+['"]moment['"]/, category: 'bundle', fix: 'manual', msg: 'moment is large: consider date-fns or dayjs' },
  { rule: 'inline-style-object', re: /style=\{\{/, category: 'perf', fix: 'ai', msg: 'Inline style object recreated each render: hoist to StyleSheet.create', gain: 'Stable style refs; fewer allocations per render' },
  { rule: 'legacy-native-modules', re: /NativeModules\.[A-Za-z]/, category: 'native', fix: 'manual', msg: 'NativeModules access: verify module supports TurboModules / interop layer' },
];
// Architecture & quality principles (reusable components, single responsibility / separation of
// concerns, performance). Regex/LOC heuristics, 0 AI tokens; ast-grep can replace these later.
const PRINCIPLES = {
  godFileLoc: 400,
  hugeComponentLoc: 250,
};
const P = (o) => ({ tool: 'principles', severity: 'info', ...o });
function principles(cwd, file, src) {
  const out = []; const r = rel(cwd, file); const lines = src.split('\n');
  const isUI = /\.(jsx|tsx)$/.test(file) || /from\s+['"]react-native['"]/.test(src);
  // SRP: god files
  if (lines.length > PRINCIPLES.godFileLoc) out.push(makeFinding(P({ rule: 'god-file', file: r, line: 1, message: `File has ${lines.length} lines (> ${PRINCIPLES.godFileLoc}): split by responsibility`, snippet: `${r}:${lines.length}`, fixability: 'manual', category: 'maintainability', gain: 'Smaller, testable modules; easier reviews and future upgrades' })));
  // SRP: huge components (top-level component start → next top-level declaration)
  const starts = [];
  lines.forEach((l, i) => { const m = l.match(/^(?:export\s+(?:default\s+)?)?(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*(?:React\.)?(?:memo\(|forwardRef\()?\s*(?:async\s*)?\()/); if (m) starts.push({ name: m[1] || m[2], i }); });
  starts.forEach((s, k) => { const end = k + 1 < starts.length ? starts[k + 1].i : lines.length; const loc = end - s.i;
    if (isUI && loc > PRINCIPLES.hugeComponentLoc) out.push(makeFinding(P({ rule: 'huge-component', file: r, line: s.i + 1, message: `Component ${s.name} is ~${loc} lines: extract subcomponents/hooks (single responsibility)`, snippet: `${s.name}:${loc}`, fixability: 'ai', category: 'maintainability', gain: 'Smaller re-render surface, reusable pieces, easier testing' }))); });
  if (isUI) {
    // Reusable components: components defined inside another component's body (re-created every render)
    lines.forEach((l, i) => { if (/^\s{2,}(?:const|function)\s+[A-Z]\w*\s*=?\s*(?:\([^)]*\)\s*=>|\()/.test(l) && /=>\s*[(<]|return\s*\(?\s*</.test(lines.slice(i, i + 4).join(' ')) && starts.some((s) => s.i < i))
      out.push(makeFinding(P({ rule: 'nested-component-definition', file: r, line: i + 1, message: 'Component defined inside another component: move to module scope / its own file so it is reusable and not remounted each render', snippet: l.trim(), fixability: 'ai', category: 'perf', gain: 'Avoids remounts and lost state on each parent render; reusable component' }))); });
    // Reusable components: repeated JSX blocks (same normalized 3-line JSX window ≥3 times)
    const win = new Map();
    for (let i = 0; i + 3 <= lines.length; i++) { const w = lines.slice(i, i + 3).map((x) => x.trim()).join('\n'); if (!/^</.test(w) || w.length < 60) continue; const k = w.replace(/["'`][^"'`]*["'`]/g, 's').replace(/\{[^{}]*\}/g, '{}'); const e = win.get(k) || { n: 0, line: i + 1 }; e.n++; win.set(k, e); }
    for (const [k, e] of win) if (e.n >= 3) out.push(makeFinding(P({ rule: 'repeated-jsx', file: r, line: e.line, message: `Similar JSX block repeated ${e.n}× in this file: extract a reusable component`, snippet: k.slice(0, 200), fixability: 'ai', category: 'maintainability', gain: 'Less duplication; one place to fix styling/behavior' })));
    // Separation of concerns: business/data logic in UI files
    const sigs = [[/\bfetch\(|axios\.|\.(get|post|put|delete)\(\s*['"`]\/?(api|https?:)/, 'network calls'], [/AsyncStorage\.|SecureStore\.|MMKV/, 'storage access'], [/\bJSON\.parse\(|\.reduce\([\s\S]{0,80}\.reduce\(/, 'data transformation']];
    const hits = sigs.filter(([re]) => re.test(src)).map(([, n]) => n);
    if (hits.length && /<[A-Z]\w*[\s/>]/.test(src)) out.push(makeFinding(P({ rule: 'logic-in-ui', file: r, line: 1, message: `UI file also contains ${hits.join(', ')}: move to a hook/service (separation of concerns)`, snippet: `${r}:${hits.join(',')}`, fixability: 'ai', category: 'maintainability', gain: 'Testable logic, reusable data layer, simpler components' })));
    // Performance: .map() rendering JSX without key
    lines.forEach((l, i) => { const w = lines.slice(i, i + 3).join(' '); if (l.includes('.map(') && /\.map\(\s*\(?[^)]*\)?\s*=>\s*\(?\s*<[A-Za-z]/.test(w) && !/\bkey=/.test(lines.slice(i, i + 6).join(' ')))
      out.push(makeFinding(P({ rule: 'missing-key', file: r, line: i + 1, severity: 'warning', message: 'List .map() renders JSX without a key prop', snippet: l.trim(), fixability: 'ai', category: 'perf', gain: 'Correct reconciliation; fewer re-mounts' }))); });
    // Performance: setState inside useEffect (derived state smell)
    const eff = /useEffect\(\s*\(\)\s*=>\s*\{?\s*set[A-Z]\w*\(/g; let m;
    while ((m = eff.exec(src))) out.push(makeFinding(P({ rule: 'setstate-in-effect', file: r, line: src.slice(0, m.index).split('\n').length, message: 'setState directly in useEffect: derive during render or useMemo instead', snippet: m[0], fixability: 'ai', category: 'perf', gain: 'Removes an extra render pass per update' })));
  }
  return out;
}

function heuristics(cwd) {
  const findings = [];
  for (const f of walk(cwd, { exts: ['.js', '.jsx', '.ts', '.tsx'], ignore: SRC_IGNORE })) {
    const src = readText(f); if (!src || src.length > 400000) continue;
    const lines = src.split('\n');
    findings.push(...principles(cwd, f, src));
    for (const h of HEURISTICS) {
      if (h.multi) { const m = h.re.exec(src); if (m) { const line = src.slice(0, m.index).split('\n').length; findings.push(makeFinding({ tool: 'heuristics', rule: h.rule, file: rel(cwd, f), line, message: h.msg, snippet: m[0].slice(0, 200), fixability: h.fix, category: h.category, gain: h.gain })); } continue; }
      lines.forEach((l, i) => { if (h.re.test(l)) findings.push(makeFinding({ tool: 'heuristics', rule: h.rule, file: rel(cwd, f), line: i + 1, severity: 'info', message: h.msg, snippet: l.trim(), fixability: h.fix, category: h.category, gain: h.gain })); });
    }
  }
  return { status: 'ran', findings };
}

// Bundle: Atlas file if present (EXPO_ATLAS=1 npx expo export), else source-map module sizes from a prior
// export, else an optional dry export (RN_MIGRATE_BUNDLE_EXPORT=1), else a stub with instructions.
function bundle(cwd, all) {
  const out = { source: 'none', topModules: [], hint: 'Run `EXPO_ATLAS=1 npx expo export --platform ios` then rescan, or set RN_MIGRATE_BUNDLE_EXPORT=1' };
  const atlas = path.join(cwd, '.expo', 'atlas.jsonl');
  if (exists(atlas)) {
    try {
      const mods = new Map();
      for (const l of readText(atlas).split('\n')) { const j = parseJSON(l); if (!Array.isArray(j)) continue;
        for (const v of j) if (Array.isArray(v)) for (const m of v) if (m && m.absolutePath && m.size) { const k = (m.package || m.relativePath || m.absolutePath); mods.set(k, (mods.get(k) || 0) + m.size); } }
      if (mods.size) { out.source = 'expo-atlas'; out.topModules = [...mods].map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size).slice(0, 25); }
    } catch {}
  }
  const exportDir = path.join(stateDir(cwd), 'export');
  if (!out.topModules.length && !exists(exportDir) && process.env.RN_MIGRATE_BUNDLE_EXPORT === '1' && all.expo) {
    log('bundle: dry export (sidecar only) → .rn-new-arch/export');
    exec('npx', ['expo', 'export', '--platform', 'ios', '--source-maps', '--output-dir', exportDir], cwd, 600000);
  }
  if (!out.topModules.length && exists(exportDir)) {
    const maps = walk(exportDir).filter((f) => f.endsWith('.map'));
    const pk = new Map();
    for (const mp of maps) { const j = readJSON(mp); if (!j?.sources) continue;
      j.sources.forEach((s, i) => { const size = (j.sourcesContent?.[i] || '').length; const m = s.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/); const k = m ? m[1] : '(app code)'; pk.set(k, (pk.get(k) || 0) + size); }); }
    if (pk.size) { out.source = 'source-map'; out.topModules = [...pk].map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size).slice(0, 25); }
  }
  const findings = out.topModules.filter((m) => m.size > 200 * 1024 && m.name !== '(app code)').map((m) => makeFinding({ tool: out.source, rule: 'large-module', file: null, severity: 'info',
    message: `${m.name} contributes ${(m.size / 1024).toFixed(0)} KB to the bundle`, snippet: m.name, fixability: 'manual', category: 'bundle' }));
  return { status: out.source === 'none' ? 'skipped' : 'ran', reason: out.source === 'none' ? 'no Atlas/export data yet (stub)' : undefined, findings, bundle: out };
}

// Callstack adapter (optional, skips gracefully). Detects Callstack OSS in the project and, when
// react-native-bundle-visualizer is installed locally and RN_MIGRATE_RNBV=1, runs it with --format json.
function callstack(cwd, all) {
  const findings = []; const used = [];
  const bin = path.join(cwd, 'node_modules', '.bin', 'react-native-bundle-visualizer');
  if (exists(bin) && process.env.RN_MIGRATE_RNBV === '1') {
    const outFile = path.join(stateDir(cwd), 'rnbv.json');
    exec(bin, ['--platform', 'ios', '--format', 'json', '--only-mapped', '--output', outFile], cwd, 600000);
    const j = readJSON(outFile, null); const files = j?.results?.[0]?.files || {};
    const pk = new Map();
    for (const [k, v] of Object.entries(files)) { const m = k.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/); const n = m ? m[1] : '(app code)'; pk.set(n, (pk.get(n) || 0) + (v.size || 0)); }
    for (const [n, size] of pk) if (size > 200 * 1024 && n !== '(app code)') findings.push(makeFinding({ tool: 'rn-bundle-visualizer', rule: 'large-module', file: null, severity: 'info', message: `${n} contributes ${(size / 1024).toFixed(0)} KB (react-native-bundle-visualizer)`, snippet: n, fixability: 'manual', category: 'bundle' }));
    if (pk.size) used.push('react-native-bundle-visualizer');
  }
  if (all['@callstack/repack']) { used.push('re-pack'); findings.push(makeFinding({ tool: 'callstack', rule: 'repack-bundler', file: 'package.json', severity: 'warning', message: 'Re.Pack (Callstack) detected: Expo SDK 58 uses Metro; Re.Pack config must be removed or re-validated after migration', snippet: '@callstack/repack', fixability: 'manual', category: 'bundle' })); }
  if (all.haul) findings.push(makeFinding({ tool: 'callstack', rule: 'haul-archived', file: 'package.json', severity: 'warning', message: 'haul (Callstack) is archived; replace with Metro (Expo default)', snippet: 'haul', fixability: 'manual', category: 'upgrade' }));
  if (all['react-native-testing-library']) findings.push(makeFinding({ tool: 'callstack', rule: 'rntl-renamed', file: 'package.json', severity: 'warning', message: 'react-native-testing-library was renamed to @testing-library/react-native (Callstack); update for React 19', snippet: 'react-native-testing-library', fixability: 'auto', category: 'upgrade' }));
  if (all['@testing-library/react-native']) used.push('rntl');
  if (all.reassure) used.push('reassure');
  const skill = ['.agents/skills', '.claude/skills', '.cursor/skills'].map((d) => path.join(cwd, d, 'react-native-best-practices')).find(exists);
  if (skill) used.push('agent-skills:react-native-best-practices');
  if (!used.length && !findings.length) return { status: 'skipped', reason: 'no Callstack tools detected (optional: npx skills add callstackincubator/agent-skills; RN_MIGRATE_RNBV=1 with react-native-bundle-visualizer installed)', findings };
  return { status: 'ran', reason: used.join(', ') || undefined, findings };
}

// Upgrade/native findings from the existing analyze manifest (codemods = auto).
function fromManifest(m) {
  const f = [];
  for (const b of m.breakingExpected || []) for (const x of b.fixes) f.push(makeFinding({ tool: 'codemods', rule: x, file: b.file, severity: 'warning', message: `Breaking change: ${x}`, snippet: `${b.file}:${x}`, fixability: 'auto', category: 'upgrade' }));
  for (const d of m.dependencies || []) if (d.status !== 'ok') f.push(makeFinding({ tool: 'deps', rule: `dep-${d.status}`, file: 'package.json', message: `${d.name} → ${d.status}${d.replacement ? ` ${d.replacement}` : ''}${d.note ? ` (${d.note})` : ''}`, snippet: d.name, fixability: 'auto', category: 'upgrade' }));
  for (const x of m.manual || []) f.push(makeFinding({ tool: 'analyze', rule: 'manual', message: x, snippet: x, fixability: 'manual', category: /android|ios|native|gradle|pod|plist/i.test(x) ? 'native' : 'upgrade' }));
  return f;
}

export function scanQuality(cwd, profile = profileFromEnv()) {
  const pkg = readJSON(path.join(cwd, 'package.json'), {});
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const manifest = readJSON(manifestPath(cwd), {});
  const tools = []; let findings = fromManifest(manifest); let bundleInfo = null;
  const RUN = { 'expo-doctor': () => expoDoctor(cwd, all), eslint: () => eslint(cwd, pkg), knip: () => knip(cwd), heuristics: () => heuristics(cwd), 'react-doctor': () => reactDoctor(cwd), bundle: () => bundle(cwd, all), callstack: () => callstack(cwd, all) };
  for (const name of ['expo-doctor', 'eslint', 'knip', 'heuristics', 'react-doctor', 'bundle', 'callstack']) {
    if (!profile.scanTools.includes(name)) { tools.push({ name, status: 'skipped', reason: name === 'react-doctor' ? 'opt-in (--react-doctor)' : `not in profile ${profile.id}` }); continue; }
    log(`scan: ${name}`);
    let r; try { r = RUN[name](); } catch (e) { r = { status: 'failed', reason: e.message.slice(0, 160), findings: [] }; }
    tools.push({ name, status: r.status, reason: r.reason, count: r.findings.length });
    findings.push(...r.findings); if (r.bundle) bundleInfo = r.bundle;
  }
  findings = dedupe(findings);
  let repoMap = null; try { repoMap = buildRepoMap(cwd, { log }); } catch (e) { log(`repo-map failed: ${e.message}`); }
  // Upgrade-only never sends anything to AI: demote ai → manual.
  if (!profile.ai) findings = findings.map((f) => (f.fixability === 'ai' ? { ...f, fixability: 'manual' } : f));
  const data = { version: 1, createdAt: new Date().toISOString(), profile: profile.id, tools, summary: summarize(findings), expectedGains: expectedGains(findings, manifest), bundle: bundleInfo, repoMap, findings };
  writeFindings(cwd, data);
  const planP = path.join(stateDir(cwd), 'plan.md');
  const plan = (readText(planP) || '').split('\n<!-- findings -->')[0];
  writeText(planP, `${plan}\n<!-- findings -->\n## Profile: ${profile.label}\n- Stages: ${profile.stages.join(' → ')}\n${formatFindings(data)}${repoMap ? `\n- Repo map: ${repoMap.tool} (${repoMap.mode}) → ${repoMap.path}, ${repoMap.bytes} B` : ''}`);
  log(`findings → .rn-new-arch/findings.json (${data.summary.total})`);
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cwd = path.resolve(process.argv[2] || '.');
  const data = scanQuality(cwd);
  console.log(formatFindings(data, { markdown: false }));
}
