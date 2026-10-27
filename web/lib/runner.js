// Server-only. Shells out to the existing CLI stage scripts with child_process.
// Nothing here uploads the project or the API key anywhere: the key is held in memory
// for the job and passed to child processes as an env var only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SCRIPTS = path.resolve(process.cwd(), '..', 'scripts');
import { resolveProfile, STAGE_SCRIPTS, PROFILES } from '../../scripts/lib/profiles.mjs';
export { PROFILES };
export const stagesFor = (profile) => profile.stages.map((id) => ({ id, ...STAGE_SCRIPTS[id] }));
export const profileEnv = (profile) => ({ RN_MIGRATE_PROFILE: profile.id, RN_MIGRATE_REACT_DOCTOR: profile.reactDoctor ? '1' : '0' });
export { resolveProfile };

const jobs = globalThis.__rnMigrateJobs || (globalThis.__rnMigrateJobs = new Map());

export function assertLocal(req) {
  const host = (req.headers.get('host') || '').split(':')[0];
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) throw new Error('This UI only serves localhost');
}

export function validateProject(p) {
  if (!p || typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('Enter an absolute path to the React Native project');
  const abs = path.resolve(p);
  if (!fs.existsSync(path.join(abs, 'package.json'))) throw new Error(`No package.json in ${abs}`);
  return abs;
}

function redact(s, key) { return key ? s.split(key).join('••••') : s; }

export function runScript(script, cwd, { env = {}, onData = () => {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(SCRIPTS, script), cwd], { cwd, env: { ...process.env, ...env, CI: '1' } });
    child.stdout.on('data', (d) => onData(d.toString()));
    child.stderr.on('data', (d) => onData(d.toString()));
    child.on('close', (code) => resolve(code));
    child.on('error', (e) => { onData(String(e)); resolve(1); });
  });
}

export function keyEnv(provider, apiKey, baseUrl, model) {
  if (!apiKey) return {};
  const m = model ? { RN_MIGRATE_AI_MODEL: model } : {};
  if (provider === 'anthropic') return { ANTHROPIC_API_KEY: apiKey, ...m };
  if (provider === 'xai') return { OPENAI_API_KEY: apiKey, OPENAI_BASE_URL: 'https://api.x.ai/v1', RN_MIGRATE_AI_MODEL: model || 'grok-4' };
  if (provider === 'compatible') return { OPENAI_API_KEY: apiKey, OPENAI_BASE_URL: baseUrl || process.env.OPENAI_BASE_URL || '', ...m };
  return { OPENAI_API_KEY: apiKey, ...m };
}

export function startJob(cwd, { provider, apiKey, baseUrl, model, skipGenerate, profile: name, reactDoctor }) {
  const profile = resolveProfile(name, { reactDoctor, skipGenerate });
  const id = crypto.randomUUID();
  const job = { id, cwd, log: '', profile: profile.id, stages: stagesFor(profile).map((s) => ({ ...s, status: 'pending' })), done: false, ok: null };
  jobs.set(id, job);
  (async () => {
    // Upgrade-only never receives the key.
    const env = { ...(profile.ai ? keyEnv(provider, apiKey, baseUrl, model) : {}), ...profileEnv(profile) };
    for (const st of job.stages) {
      st.status = 'running';
      const code = await runScript(st.script, cwd, { env, onData: (d) => { job.log = (job.log + redact(d, apiKey)).slice(-200000); } });
      st.status = code === 0 ? 'done' : 'failed';
      // verify returns non-zero on failed checks but still writes the report; keep going for the others only if not fatal.
      if (code !== 0 && st.id !== 'verify') { job.ok = false; break; }
      if (st.id === 'verify') job.ok = code === 0;
    }
    const report = path.join(cwd, 'MIGRATION.md');
    job.reportPath = fs.existsSync(report) ? report : null;
    job.report = job.reportPath ? fs.readFileSync(report, 'utf8') : null;
    job.findings = readFindingsSafe(cwd);
    job.done = true;
  })();
  return job;
}

export const getJob = (id) => jobs.get(id);

export function readFindingsSafe(cwd) {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, '.rn-new-arch', 'findings.json'), 'utf8')); } catch { return null; }
}
