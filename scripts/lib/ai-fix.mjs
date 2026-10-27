// Thin AI fixer. Sends ONLY batches of fixability:ai findings with a small code window around each
// line (never the full repo). Applies a replacement only if the window is unchanged since it was sent.
// No key → nothing is sent; findings are listed as manual in MIGRATION.md.
import fs from 'node:fs';
import path from 'node:path';
import { readText, writeJSON, stateDir, recordState, log } from './fs-utils.mjs';
import { readFindings } from './findings.mjs';
import { mapExcerpt } from './repo-map.mjs';

const CTX = 8, BATCH = 12, MAX_BATCHES = Number(process.env.RN_MIGRATE_AI_MAX_BATCHES || 5);

export function aiProvider(env = process.env) {
  if (env.ANTHROPIC_API_KEY) return { kind: 'anthropic', key: env.ANTHROPIC_API_KEY, model: env.RN_MIGRATE_AI_MODEL || 'claude-sonnet-4-5' };
  if (env.OPENAI_API_KEY) return { kind: 'openai', key: env.OPENAI_API_KEY, base: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), model: env.RN_MIGRATE_AI_MODEL || 'gpt-4.1-mini' };
  return null;
}

export function selectAiFindings(cwd, profile) {
  return (readFindings(cwd).findings || []).filter((f) => f.fixability === 'ai' && f.file && f.line && profile.aiCategories.includes(f.category));
}

function windowFor(cwd, f) {
  const src = readText(path.join(cwd, f.file)); if (src === null) return null;
  const lines = src.split('\n'); const start = Math.max(1, f.line - CTX), end = Math.min(lines.length, f.line + CTX);
  return { start, end, code: lines.slice(start - 1, end).join('\n') };
}

async function ask(p, prompt) {
  const sys = 'You fix React Native / Expo SDK 58 code findings. Reply with JSON only: {"fixes":[{"id":"…","startLine":n,"endLine":n,"code":"replacement lines","explanation":"…"}]}. Only replace lines inside the given window; omit a finding if unsure.';
  if (p.kind === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': p.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: p.model, max_tokens: 4096, system: sys, messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status); return j.content?.[0]?.text || '';
  }
  const r = await fetch(`${p.base}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${p.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: p.model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }] }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status); return j.choices?.[0]?.message?.content || '';
}

export async function aiFix(cwd, profile) {
  const selected = selectAiFindings(cwd, profile);
  const p = aiProvider();
  const result = { provider: p?.kind || null, considered: selected.length, applied: [], rejected: [], manual: [], batches: 0 };
  if (!profile.ai || !p || !selected.length) {
    result.manual = selected.map((f) => `${f.file}:${f.line} ${f.tool}:${f.rule} — ${f.message}`);
    result.reason = !profile.ai ? `profile ${profile.id} has no AI stage` : !p ? 'no AI key set' : 'no fixability:ai findings';
    recordState(cwd, 'ai', result); log(`ai: ${result.reason}; ${result.manual.length} listed as manual`); return result;
  }
  const items = selected.map((f) => ({ f, w: windowFor(cwd, f) })).filter((x) => x.w);
  const handled = new Set();
  const mapNote = mapExcerpt(cwd);
  for (let b = 0; b < items.length && result.batches < MAX_BATCHES; b += BATCH) {
    const batch = items.slice(b, b + BATCH); result.batches++;
    let prompt = batch.map(({ f, w }) => `### id=${f.id} file=${f.file} rule=${f.tool}:${f.rule} line=${f.line}\n${f.message}\nWindow lines ${w.start}-${w.end}:\n\`\`\`\n${w.code}\n\`\`\``).join('\n\n');
    if (mapNote) prompt = `${mapNote}\n\n---\n\n${prompt}`;
    log(`ai: batch ${result.batches} (${batch.length} findings, ${prompt.length} chars)`);
    let fixes = [];
    try { const t = await ask(p, prompt); fixes = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)).fixes || []; } catch (e) { log(`ai: batch failed: ${e.message}`); }
    // Apply bottom-up per file so line numbers stay valid; verify window unchanged.
    const byFile = {};
    for (const fx of fixes) { const it = batch.find((x) => x.f.id === fx.id); if (it) (byFile[it.f.file] ||= []).push({ fx, it }); }
    for (const [file, list] of Object.entries(byFile)) {
      const abs = path.join(cwd, file); let lines = readText(abs).split('\n');
      for (const { fx, it } of list.sort((a, c) => c.fx.startLine - a.fx.startLine)) {
        const ok = Number.isInteger(fx.startLine) && Number.isInteger(fx.endLine) && fx.startLine >= it.w.start && fx.endLine <= it.w.end && fx.startLine <= fx.endLine
          && lines.slice(it.w.start - 1, it.w.end).join('\n') === it.w.code;
        if (!ok) { result.rejected.push(`${file}:${it.f.line} ${it.f.rule} (out of window or file changed)`); continue; }
        lines.splice(fx.startLine - 1, fx.endLine - fx.startLine + 1, ...String(fx.code).split('\n'));
        result.applied.push(`${file}:${it.f.line} ${it.f.tool}:${it.f.rule} — ${fx.explanation || 'fixed'}`); handled.add(it.f.id);
      }
      fs.writeFileSync(abs, lines.join('\n'));
    }
  }
  result.manual = selected.filter((f) => !handled.has(f.id)).map((f) => `${f.file}:${f.line} ${f.tool}:${f.rule} — ${f.message}`);
  writeJSON(path.join(stateDir(cwd), 'ai-result.json'), result);
  recordState(cwd, 'ai', result);
  log(`ai: applied ${result.applied.length}, rejected ${result.rejected.length}, manual ${result.manual.length}`);
  return result;
}
