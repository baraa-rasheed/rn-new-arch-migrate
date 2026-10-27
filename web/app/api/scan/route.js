import fs from 'node:fs';
import path from 'node:path';
import { assertLocal, validateProject, runScript, resolveProfile, profileEnv, stagesFor, readFindingsSafe } from '@/lib/runner';

export const runtime = 'nodejs';

// Read-only scan: runs analyze.mjs, which writes only .rn-new-arch/ sidecars.
export async function POST(req) {
  try {
    assertLocal(req);
    const { path: p, profile: name, reactDoctor, skipGenerate } = await req.json();
    const profile = resolveProfile(name, { reactDoctor: !!reactDoctor, skipGenerate: !!skipGenerate });
    const cwd = validateProject(p);
    let log = '';
    const code = await runScript('analyze.mjs', cwd, { onData: (d) => { log += d; } });
    if (code !== 0) return Response.json({ error: 'Scan failed', log }, { status: 400 });
    // Local quality scan (0 tokens); optional tools are skipped, never fatal.
    await runScript('scan-quality.mjs', cwd, { env: profileEnv(profile), onData: (d) => { log += d; } });
    const dir = path.join(cwd, '.rn-new-arch');
    return Response.json({
      cwd,
      plan: fs.readFileSync(path.join(dir, 'plan.md'), 'utf8'),
      profile: { id: profile.id, label: profile.label, description: profile.description, stages: stagesFor(profile) },
      findings: readFindingsSafe(cwd),
      log,
      manifest: JSON.parse(fs.readFileSync(path.join(dir, 'migration-manifest.json'), 'utf8')),
    });
  } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
}
