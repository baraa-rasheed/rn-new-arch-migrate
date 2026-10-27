'use client';
import { useEffect, useRef, useState } from 'react';

const box = { background: '#151924', border: '1px solid #262c3b', borderRadius: 10, padding: 16, marginBottom: 16 };
const input = { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #333a4d', background: '#0b0d12', color: '#e6e8ee', boxSizing: 'border-box' };
const btn = (on = true) => ({ padding: '10px 16px', borderRadius: 8, border: 0, background: on ? '#4f7cff' : '#333a4d', color: '#fff', cursor: on ? 'pointer' : 'not-allowed', marginRight: 8 });
const PROFILES = [
  { id: 'upgrade', label: 'Upgrade only', desc: 'SDK 58 / New Architecture upgrade. No quality fixes, AI key never used.' },
  { id: 'quality', label: 'Upgrade + quality', desc: 'Upgrade + eslint/expo auto-fixes. AI only on leftover fixability:ai findings.' },
  { id: 'full', label: 'Full refactor', desc: 'Upgrade + quality + perf/bundle refactors (knip --fix, AI batches on leftovers).' },
];
const CATS = ['all', 'upgrade', 'lint', 'perf', 'bundle', 'native'];
const SEV = { error: '#ff6b6b', warning: '#ffcc66', info: '#9aa3b8' };
const pre = { whiteSpace: 'pre-wrap', background: '#0b0d12', padding: 12, borderRadius: 8, overflow: 'auto' };

function Findings({ data }) {
  const [cat, setCat] = useState('all');
  if (!data) return <p style={{ color: '#9aa3b8' }}>No findings file.</p>;
  const list = (data.findings || []).filter((f) => cat === 'all' || f.category === cat);
  const s = data.summary || {};
  return (
    <div>
      <p>Total <b>{s.total}</b> · {Object.entries(s.byFixability || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
      <p style={{ fontSize: 12, color: '#9aa3b8' }}>Tools: {(data.tools || []).map((t) => `${t.name}=${t.status}${t.reason ? ` (${t.reason})` : ''}`).join('; ')}</p>
      {data.repoMap && <p style={{ fontSize: 12, color: '#9aa3b8' }}>Repo map: {data.repoMap.tool} ({data.repoMap.mode}) · {(data.repoMap.bytes / 1024).toFixed(1)} KB · {data.repoMap.path}</p>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {CATS.map((c) => <button key={c} onClick={() => setCat(c)} style={{ ...btn(true), background: c === cat ? '#4f7cff' : '#262c3b', padding: '4px 10px' }}>{c} {c === 'all' ? s.total : (s.byCategory?.[c] || 0)}</button>)}
      </div>
      <div style={{ maxHeight: 320, overflow: 'auto', fontSize: 13 }}>
        {list.slice(0, 300).map((f) => (
          <div key={f.id} style={{ borderBottom: '1px solid #262c3b', padding: '4px 0' }}>
            <span style={{ color: SEV[f.severity] }}>●</span> <code>{f.tool}:{f.rule}</code> <span style={{ color: '#9aa3b8' }}>[{f.category}/{f.fixability}]</span> {f.file && <code>{f.file}{f.line ? `:${f.line}` : ''}</code>} — {f.message}
          </div>
        ))}
        {!list.length && <p style={{ color: '#9aa3b8' }}>None.</p>}
      </div>
      {data.bundle?.topModules?.length > 0 && (<>
        <h4>Bundle top modules ({data.bundle.source})</h4>
        {data.bundle.topModules.slice(0, 15).map((m) => {
          const max = data.bundle.topModules[0].size;
          return <div key={m.name} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><div style={{ width: 220, overflow: 'hidden' }}>{m.name}</div><div style={{ background: '#4f7cff', height: 8, width: `${(m.size / max) * 50}%` }} /><span>{(m.size / 1024).toFixed(0)} KB</span></div>;
        })}
      </>)}
      {data.bundle && !data.bundle.topModules?.length && <p style={{ fontSize: 12, color: '#9aa3b8' }}>Bundle/Atlas: {data.bundle.hint}</p>}
      {data.expectedGains?.length > 0 && (<><h4>Expected gains (heuristic)</h4><ul>{data.expectedGains.map((g) => <li key={g}>{g}</li>)}</ul></>)}
    </div>
  );
}

const ICON = { pending: '○', running: '◐', done: '●', failed: '✕' };

export default function Home() {
  const [projectPath, setProjectPath] = useState('');
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [skipGenerate, setSkipGenerate] = useState(false);
  const [profile, setProfile] = useState('upgrade');
  const [reactDoctor, setReactDoctor] = useState(false);
  const [scan, setScan] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  async function doScan() {
    setErr(''); setScan(null); setJob(null); setStatus(null); setConfirmText(''); setBusy(true);
    const r = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: projectPath.trim(), profile, reactDoctor, skipGenerate }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return setErr(j.error + (j.log ? `\n${j.log}` : ''));
    setScan(j);
  }

  async function doRun() {
    setErr('');
    const r = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: scan.cwd, confirm: confirmText, provider, apiKey, skipGenerate, profile, reactDoctor }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setJob(j.id);
  }

  useEffect(() => {
    if (!job) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/run/${job}`); const j = await r.json(); setStatus(j);
      if (j.done) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [job]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [status?.log]);

  const confirmed = confirmText.trim().toLowerCase() === 'yes';
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>React Native → Expo SDK 58</h1>
      <p style={{ color: '#9aa3b8', marginTop: 0 }}>Local only (127.0.0.1). Your project path and API key never leave this machine; nothing is uploaded.</p>

      <section style={box}>
        <h3>1. Project</h3>
        <label>Absolute path to the React Native project root (folder with package.json)</label>
        <input style={input} placeholder="/Users/you/code/my-app" value={projectPath} onChange={(e) => setProjectPath(e.target.value)} />
        <h3 style={{ marginTop: 16 }}>AI provider key (optional)</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={{ ...input, width: 220 }} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="openai">OpenAI (OPENAI_API_KEY)</option>
            <option value="anthropic">Anthropic (ANTHROPIC_API_KEY)</option>
            <option value="compatible">OpenAI-compatible (OPENAI_API_KEY + OPENAI_BASE_URL)</option>
          </select>
          <input style={input} type="password" autoComplete="off" placeholder="sk-… (kept in memory, passed to local scripts as env only)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
        <h3 style={{ marginTop: 16 }}>Flow profile</h3>
        <select style={{ ...input, width: 260 }} value={profile} onChange={(e) => { setProfile(e.target.value); setScan(null); }}>
          {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <p style={{ color: '#9aa3b8', margin: '6px 0' }}>{PROFILES.find((p) => p.id === profile).desc}{profile === 'upgrade' && apiKey ? ' (key ignored in this profile)' : ''}</p>
        {profile === 'full' && <label style={{ display: 'block' }}><input type="checkbox" checked={reactDoctor} onChange={(e) => setReactDoctor(e.target.checked)} /> Opt in to react-doctor (Modified MIT license; runs with --no-telemetry)</label>}
        <label style={{ display: 'block', marginTop: 12 }}><input type="checkbox" checked={skipGenerate} onChange={(e) => setSkipGenerate(e.target.checked)} /> Skip prebuild (stage 4)</label>
        <div style={{ marginTop: 12 }}><button style={btn(!!projectPath && !busy)} disabled={!projectPath || busy} onClick={doScan}>{busy ? 'Scanning…' : 'Scan (read-only)'}</button></div>
      </section>

      {err && <pre style={{ ...box, borderColor: '#a33', whiteSpace: 'pre-wrap' }}>{err}</pre>}

      {scan && (
        <section style={box}>
          <h3>2. Migration plan</h3>
          <p style={{ color: '#9aa3b8' }}>Nothing in your project has changed yet. Only <code>.rn-new-arch/</code> sidecar files were written.</p>
          <h4>What will run ({scan.profile?.label})</h4>
          <ol>{(scan.profile?.stages || []).map((s) => <li key={s.id}>{s.label}</li>)}</ol>
          <h4>Changes summary (diff preview)</h4>
          <ul>
            <li>Dependencies: {(scan.manifest.dependencies || []).filter((d) => d.status === 'replace').length} replaced, {(scan.manifest.dependencies || []).filter((d) => d.status === 'remove').length} removed, rest aligned via <code>expo install --fix</code></li>
            <li>Codemod edits in {(scan.manifest.breakingExpected || []).length} file(s): {(scan.manifest.breakingExpected || []).slice(0, 8).map((b) => `${b.file} (${b.fixes.join(', ')})`).join('; ') || 'none'}</li>
            <li>Native files to extract: {(scan.manifest.extractNative || []).length}</li>
            <li>Auto-fixable findings: {scan.findings?.summary?.byFixability?.auto || 0} · AI candidates: {scan.findings?.summary?.byFixability?.ai || 0}{profile !== 'upgrade' && !apiKey ? ' (no key → listed as manual)' : ''} · manual: {scan.findings?.summary?.byFixability?.manual || 0}</li>
          </ul>
          <h4>Findings: bad practices, perf, bundle bottlenecks</h4>
          <Findings data={scan.findings} />
          <details><summary>Full plan (plan.md)</summary><pre style={{ ...pre, maxHeight: 420 }}>{scan.plan}</pre></details>
          <h3>3. Confirm</h3>
          <p>Commit or stash first. Type <b>yes</b> to apply this plan.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...input, width: 160 }} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="yes" disabled={!!job} />
            <button style={btn(confirmed && !job)} disabled={!confirmed || !!job} onClick={doRun}>Confirm &amp; migrate</button>
          </div>
        </section>
      )}

      {status && (
        <section style={box}>
          <h3>4. Progress — {status.profile}</h3>
          {(() => { const n = status.stages.length, d = status.stages.filter((s) => s.status === 'done').length; return <div style={{ background: '#262c3b', borderRadius: 6, height: 8, marginBottom: 8 }}><div style={{ background: '#6bdc8b', height: 8, borderRadius: 6, width: `${(d / n) * 100}%` }} /></div>; })()}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {status.stages.map((s) => <li key={s.id} style={{ color: s.status === 'failed' ? '#ff6b6b' : s.status === 'done' ? '#6bdc8b' : '#e6e8ee' }}>{ICON[s.status]} {s.label} — {s.status}</li>)}
          </ul>
          <pre ref={logRef} style={{ whiteSpace: 'pre-wrap', background: '#0b0d12', padding: 12, borderRadius: 8, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{status.log}</pre>
          {status.done && (
            <div>
              <h3>{status.ok ? '✅ Static checks passed' : '⚠️ Finished with issues'}</h3>
              {status.reportPath ? <p>Report: <code>{status.reportPath}</code></p> : <p>No MIGRATION.md was written; see log.</p>}
              {status.report && <pre style={{ whiteSpace: 'pre-wrap', background: '#0b0d12', padding: 12, borderRadius: 8, maxHeight: 500, overflow: 'auto' }}>{status.report}</pre>}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
