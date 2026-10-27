// Flow profiles. Each lists the stages the router runs and the scan tools it enables.
// Stage ids map to scripts in STAGE_SCRIPTS (shared with web/lib/runner.js).
export const STAGE_SCRIPTS = {
  migrate: { label: 'Migrate (expo install expo@^58 → --fix)', script: 'migrate.mjs' },
  breaking: { label: 'Breaking-change fixes (codemods)', script: 'breaking-fixes.mjs' },
  generate: { label: 'Extract native → plugin → prebuild --clean', script: 'generate.mjs' },
  quality: { label: 'Quality auto-fixes (eslint --fix, expo install --fix)', script: 'quality-fix.mjs' },
  ai: { label: 'AI fixes on leftover findings (fixability: ai only)', script: 'ai-fix.mjs' },
  verify: { label: 'Verify + write MIGRATION.md', script: 'verify.mjs' },
};

export const PROFILES = {
  upgrade: {
    id: 'upgrade', label: 'Upgrade only',
    description: 'Expo SDK 58 / RN New Architecture upgrade. No lint/quality fixes, no AI.',
    stages: ['migrate', 'breaking', 'generate', 'verify'],
    scanTools: ['expo-doctor', 'bundle', 'callstack'], ai: false,
  },
  quality: {
    id: 'quality', label: 'Upgrade + quality',
    description: 'Upgrade, then auto-fix lint/quality findings with existing tools. AI only on fixability:ai findings if a key is set.',
    stages: ['migrate', 'breaking', 'generate', 'quality', 'ai', 'verify'],
    scanTools: ['expo-doctor', 'eslint', 'knip', 'heuristics', 'bundle', 'callstack'], ai: true,
  },
  full: {
    id: 'full', label: 'Full refactor',
    description: 'Upgrade + quality + perf/bundle refactors; AI batches every leftover fixability:ai finding.',
    stages: ['migrate', 'breaking', 'generate', 'quality', 'ai', 'verify'],
    scanTools: ['expo-doctor', 'eslint', 'knip', 'heuristics', 'react-doctor', 'bundle', 'callstack'], ai: true, aiCategories: ['lint', 'perf', 'bundle', 'upgrade'],
  },
};

// react-doctor (Modified MIT) is opt-in: only runs when the profile includes it AND opts.reactDoctor is true.
export function resolveProfile(name = 'upgrade', { reactDoctor = false, skipGenerate = false } = {}) {
  const p = PROFILES[name] || PROFILES.upgrade;
  return {
    ...p,
    reactDoctor: reactDoctor && p.scanTools.includes('react-doctor'),
    scanTools: p.scanTools.filter((t) => t !== 'react-doctor' || reactDoctor),
    stages: p.stages.filter((s) => !(skipGenerate && s === 'generate')),
    aiCategories: p.aiCategories || (p.ai ? ['lint', 'perf'] : []),
  };
}

export const profileFromEnv = () => resolveProfile(process.env.RN_MIGRATE_PROFILE || 'upgrade', { reactDoctor: process.env.RN_MIGRATE_REACT_DOCTOR === '1' });
