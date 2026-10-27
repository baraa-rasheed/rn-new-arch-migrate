import { assertLocal, getJob } from '@/lib/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Polled by the UI for live stage progress.
export async function GET(req, { params }) {
  try { assertLocal(req); } catch (e) { return Response.json({ error: e.message }, { status: 403 }); }
  const { id } = await params;
  const job = getJob(id);
  if (!job) return Response.json({ error: 'Unknown job' }, { status: 404 });
  const { stages, log, done, ok, reportPath, report, cwd, profile, findings } = job;
  return Response.json({ stages: stages.map(({ id, label, status }) => ({ id, label, status })), log, done, ok, reportPath, report, cwd, profile, findings });
}
