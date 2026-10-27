import fs from 'node:fs';
import path from 'node:path';
import { assertLocal, validateProject, startJob } from '@/lib/runner';

export const runtime = 'nodejs';

// The UI's Confirm button is the gate: execution requires confirm === "yes" and a prior scan.
export async function POST(req) {
  try {
    assertLocal(req);
    const { path: p, confirm, provider, apiKey, skipGenerate, profile, reactDoctor } = await req.json();
    if (String(confirm || '').trim().toLowerCase() !== 'yes') return Response.json({ error: 'Confirmation required: type yes' }, { status: 400 });
    const cwd = validateProject(p);
    if (!fs.existsSync(path.join(cwd, '.rn-new-arch', 'migration-manifest.json'))) return Response.json({ error: 'Scan first' }, { status: 400 });
    const job = startJob(cwd, { provider, apiKey, skipGenerate: !!skipGenerate, profile, reactDoctor: !!reactDoctor });
    return Response.json({ id: job.id });
  } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
}
