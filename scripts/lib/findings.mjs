// Unified finding shape shared by every wrapped tool (eslint, knip, expo-doctor, react-doctor,
// bundle/Atlas, local heuristics, upgrade codemods). Pure helpers + sidecar I/O.
import path from 'node:path';
import { sha, readJSON, writeJSON, stateDir } from './fs-utils.mjs';

export const SEVERITIES = ['error', 'warning', 'info'];
export const FIXABILITY = ['auto', 'ai', 'manual'];
export const CATEGORIES = ['upgrade', 'lint', 'perf', 'bundle', 'native', 'maintainability'];
export const findingsPath = (cwd) => path.join(stateDir(cwd), 'findings.json');

export function makeFinding({ tool, rule, file = null, line = null, severity = 'warning', message, snippet = '', fixability = 'manual', category = 'lint', gain = null }) {
  const snippetHash = sha(String(snippet || message || '')).slice(0, 12);
  const id = sha([tool, rule, file, line, snippetHash].join('|')).slice(0, 16);
  return {
    id, tool, rule: String(rule || 'unknown'), file, line: line == null ? null : Number(line),
    severity: SEVERITIES.includes(severity) ? severity : 'warning',
    message: String(message || '').slice(0, 500), snippetHash,
    fixability: FIXABILITY.includes(fixability) ? fixability : 'manual',
    category: CATEGORIES.includes(category) ? category : 'lint',
    ...(gain ? { expectedGain: String(gain).slice(0, 200) } : {}),
  };
}

export function dedupe(list) { const m = new Map(); for (const f of list) if (!m.has(f.id)) m.set(f.id, f); return [...m.values()]; }

export function summarize(findings) {
  const by = (k) => findings.reduce((a, f) => ((a[f[k]] = (a[f[k]] || 0) + 1), a), {});
  return { total: findings.length, bySeverity: by('severity'), byCategory: by('category'), byFixability: by('fixability'), byTool: by('tool') };
}

export function writeFindings(cwd, data) { writeJSON(findingsPath(cwd), data); return data; }
export const readFindings = (cwd) => readJSON(findingsPath(cwd), { findings: [], tools: [], summary: summarize([]) });

// Rough, explicitly-labelled expectations per category (heuristic, not a measurement).
export function expectedGains(findings, manifest = {}) {
  const c = summarize(findings).byCategory;
  const g = ['New Architecture (Fabric + TurboModules, bridgeless) on RN 0.88 via Expo SDK 58: faster startup and sync native calls (typical, app-dependent)'];
  if (c.bundle) g.push(`${c.bundle} bundle finding(s): replacing heavy/full-library imports usually trims JS bundle size and parse time`);
  if (c.perf) g.push(`${c.perf} perf finding(s): list virtualization / native-driver animations / removing console.* reduce JS-thread work`);
  if ((manifest.dependencies || []).some((d) => d.status === 'replace')) g.push('Replaced legacy packages with maintained Expo modules (New-Arch native)');
  return g;
}

export function formatFindings(data, { markdown = true, max = 40 } = {}) {
  const H = (t) => (markdown ? `\n## ${t}\n` : `\n=== ${t} ===\n`);
  const s = data.summary || summarize(data.findings || []);
  const out = [H(`Findings (local scan, 0 AI tokens) — profile: ${data.profile || 'n/a'}`)];
  out.push(`- Total ${s.total}: ` + Object.entries(s.byCategory).map(([k, v]) => `${k} ${v}`).join(', '));
  out.push(`- Fixability: ` + Object.entries(s.byFixability).map(([k, v]) => `${k} ${v}`).join(', '));
  out.push('- Tools: ' + (data.tools || []).map((t) => `${t.name}=${t.status}${t.reason ? ` (${t.reason})` : ''}`).join('; '));
  for (const cat of CATEGORIES) {
    const fs = (data.findings || []).filter((f) => f.category === cat);
    if (!fs.length) continue;
    out.push(markdown ? `\n### ${cat} (${fs.length})` : `\n-- ${cat} (${fs.length})`);
    for (const f of fs.slice(0, max)) out.push(`- [${f.severity}/${f.fixability}] ${f.tool}:${f.rule} ${f.file ? `${f.file}${f.line ? `:${f.line}` : ''} ` : ''}— ${f.message}`);
    if (fs.length > max) out.push(`- …and ${fs.length - max} more (see .rn-new-arch/findings.json)`);
  }
  if (data.bundle?.topModules?.length) {
    out.push(H(`Bundle top modules (${data.bundle.source})`));
    for (const m of data.bundle.topModules.slice(0, 15)) out.push(`- ${m.name} — ${(m.size / 1024).toFixed(1)} KB`);
  }
  if (data.expectedGains?.length) { out.push(H('Expected gains (heuristic)')); out.push(data.expectedGains.map((x) => `- ${x}`).join('\n')); }
  return out.join('\n') + '\n';
}
