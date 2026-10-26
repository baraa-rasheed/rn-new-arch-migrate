#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline/promises';
import { analyze } from './analyze.mjs';
import { migrate } from './migrate.mjs';
import { breakingFixes } from './breaking-fixes.mjs';
import { generate } from './generate.mjs';
import { verify } from './verify.mjs';
import { log } from './lib/fs-utils.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
if (flag('--help') || flag('-h')) {
  console.log(`rn-new-arch-migrate: migrate any React Native app to Expo SDK 58

Usage: npx rn-new-arch-migrate [--cwd <path>] [--analyze-only] [--skip-generate] [--yes]
Stages: analyze → migrate → breaking-fixes → generate → verify`);
  process.exit(0);
}
const ci = argv.indexOf('--cwd');
const cwd = path.resolve(ci >= 0 ? argv[ci + 1] : process.cwd());

try {
  log('Stage 1/5 analyze');
  const m = analyze(cwd);
  if (flag('--analyze-only')) process.exit(0);
  if (!flag('--yes') && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const a = await rl.question(`Migrate ${m.packageJson.name} (${m.projectType}) to Expo SDK 58? Commit first. [y/N] `);
    rl.close();
    if (!/^y/i.test(a)) process.exit(1);
  }
  log('Stage 2/5 migrate'); migrate(cwd);
  log('Stage 3/5 breaking-fixes'); breakingFixes(cwd);
  if (!flag('--skip-generate')) { log('Stage 4/5 generate'); generate(cwd); } else log('Stage 4/5 skipped');
  log('Stage 5/5 verify');
  const ok = verify(cwd, { skipGenerate: flag('--skip-generate') });
  log('Report: .rn-new-arch/report.md');
  process.exit(ok ? 0 : 1);
} catch (e) { console.error('[rn→expo58] ERROR', e.message); process.exit(1); }
