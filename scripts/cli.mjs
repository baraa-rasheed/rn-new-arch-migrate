#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline/promises';
import { analyze } from './analyze.mjs';
import { migrate } from './migrate.mjs';
import { breakingFixes } from './breaking-fixes.mjs';
import { generate } from './generate.mjs';
import { verify } from './verify.mjs';
import { log } from './lib/fs-utils.mjs';
import { printPlan } from './lib/print-plan.mjs';
import { writeReport } from './lib/write-report.mjs';
import { scanQuality } from './scan-quality.mjs';
import { qualityFix } from './quality-fix.mjs';
import { aiFix } from './lib/ai-fix.mjs';
import { resolveProfile, PROFILES, STAGE_SCRIPTS } from './lib/profiles.mjs';
import { formatFindings } from './lib/findings.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
if (flag('--help') || flag('-h')) {
  console.log(`rn-new-arch-migrate: migrate any React Native app to Expo SDK 58

Usage: npx rn-new-arch-migrate [--cwd <path>] [--analyze-only] [--skip-generate] [--yes]
       [--profile upgrade|quality|full] [--react-doctor]
Profiles:
${Object.values(PROFILES).map((p) => `  ${p.id.padEnd(8)} ${p.label}: ${p.description}`).join('\n')}
Flow: analyze + scan-quality (local, 0 tokens) → [plan + findings + confirmation] → profile stages → verify → MIGRATION.md

After analyze, the full plan is printed and saved to .rn-new-arch/plan.md. Type "yes" to proceed;
anything else aborts with the project untouched. --yes skips the prompt (CI/agents; agents must
show the plan to the user and get approval first unless the user already said to proceed).`);
  process.exit(0);
}
const ci = argv.indexOf('--cwd');
const cwd = path.resolve(ci >= 0 ? argv[ci + 1] : process.cwd());
const pi = argv.indexOf('--profile');
const profileName = pi >= 0 ? argv[pi + 1] : (process.env.RN_MIGRATE_PROFILE || 'upgrade');
if (!PROFILES[profileName]) { console.error(`Unknown profile ${profileName}`); process.exit(1); }
const profile = resolveProfile(profileName, { reactDoctor: flag('--react-doctor') || process.env.RN_MIGRATE_REACT_DOCTOR === '1', skipGenerate: flag('--skip-generate') });
process.env.RN_MIGRATE_PROFILE = profile.id; if (profile.reactDoctor) process.env.RN_MIGRATE_REACT_DOCTOR = '1';

try {
  log(`Profile: ${profile.label} — stages: ${profile.stages.join(' → ')}`);
  log('Scan: analyze + quality (local, 0 tokens)');
  const m = analyze(cwd);
  printPlan(m);
  const fd = scanQuality(cwd, profile);
  console.log(formatFindings(fd, { markdown: false }));
  log('Plan saved to .rn-new-arch/plan.md, findings to .rn-new-arch/findings.json');
  if (flag('--analyze-only')) process.exit(0);
  if (!flag('--yes')) {
    if (!process.stdin.isTTY) { console.error('[rn→expo58] No TTY for confirmation. Review .rn-new-arch/plan.md, then rerun with --yes. Nothing was changed.'); process.exit(2); }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const a = (await rl.question('Type "yes" to apply this plan (anything else aborts): ')).trim();
    rl.close();
    if (a.toLowerCase() !== 'yes') { log('Aborted. Nothing was modified (only .rn-new-arch/ sidecar files were written).'); process.exit(1); }
  } else log('--yes: skipping confirmation prompt');
  // Stage router: only the profile's stages run.
  const RUN = { migrate: () => migrate(cwd), breaking: () => breakingFixes(cwd), generate: () => generate(cwd), quality: () => qualityFix(cwd, profile), ai: () => aiFix(cwd, profile) };
  let ok = true;
  for (const [i, id] of profile.stages.entries()) {
    log(`Stage ${i + 1}/${profile.stages.length} ${STAGE_SCRIPTS[id].label}`);
    if (id === 'verify') ok = verify(cwd, { skipGenerate: !profile.stages.includes('generate'), report: false });
    else await RUN[id]();
  }
  writeReport(cwd);
  log('Report: MIGRATION.md (copy: .rn-new-arch/report.md)');
  process.exit(ok ? 0 : 1);
} catch (e) { console.error('[rn→expo58] ERROR', e.message); process.exit(1); }
