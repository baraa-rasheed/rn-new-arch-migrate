// Formats the migration plan from the manifest. Pure function: no I/O.
import { SDK } from './deps.mjs';

export function formatPlan(m, { markdown = false } = {}) {
  const H = (t) => (markdown ? `\n## ${t}\n` : `\n=== ${t} ===\n`);
  const li = (arr, empty = '(none)') => (arr.length ? arr.map((x) => `- ${x}`).join('\n') : `- ${empty}`);
  const deps = m.dependencies || [];
  const replace = deps.filter((d) => d.status === 'replace');
  const remove = deps.filter((d) => d.status === 'remove');
  const ok = deps.filter((d) => d.status === 'ok');
  const a = m.native?.android, i = m.native?.ios;
  const out = [];
  out.push(markdown ? `# Migration plan: ${m.packageJson.name} → Expo SDK 58` : `MIGRATION PLAN: ${m.packageJson.name} → Expo SDK 58`);
  out.push(`Project type: ${m.projectType} · react-native ${m.versions.reactNative} → ${SDK.reactNative} · react ${m.versions.react} → ${SDK.react} · expo ${m.versions.expo || '(none)'} → ${SDK.expo}`);
  out.push(H('Packages to upgrade'));
  out.push(`- \`npx expo install expo@${SDK.expo}\` then \`npx expo install --fix\` (aligns every SDK package)`);
  out.push(li(ok.map((d) => `${d.name}@${d.from} → SDK 58-compatible version`)));
  out.push(H('Packages to replace'));
  out.push(li(replace.map((d) => `${d.name} → ${d.replacement}${d.note ? ` (${d.note})` : ''}`)));
  out.push(H('Packages to remove'));
  out.push(li(remove.map((d) => `${d.name} (${d.note})`)));
  out.push(H('Native files to extract (→ .rn-new-arch/extracted-native/), then `expo prebuild --clean`'));
  out.push(li(m.extractNative || [], 'no native folders'));
  out.push(H('Native customizations to re-apply via plugins/restore-native-overlay.js'));
  const ov = [];
  if (a?.permissions?.length) ov.push(`Android permissions: ${a.permissions.join(', ')}`);
  if (a?.metaData?.length) ov.push(`Android <meta-data>: ${a.metaData.map((x) => x.name).join(', ')}`);
  if (a?.gradleExtras?.length) ov.push(`build.gradle extras: ${a.gradleExtras.length} line(s)`);
  if (i?.infoPlistKeys?.length) ov.push(`Info.plist usage keys: ${i.infoPlistKeys.join(', ')}`);
  if (i?.urlSchemes?.length) ov.push(`URL schemes: ${i.urlSchemes.join(', ')}`);
  if (i?.backgroundModes?.length) ov.push(`UIBackgroundModes: ${i.backgroundModes.join(', ')}`);
  if (i?.podExtras?.length) ov.push(`Podfile extras: ${i.podExtras.length} line(s)`);
  if (m.configSnapshot?.appJson) ov.push('Existing app.json settings preserved and merged');
  out.push(li(ov));
  out.push(H('Breaking changes expected (codemods)'));
  out.push(li((m.breakingExpected || []).map((b) => `${b.file}: ${b.fixes.join(', ')}`)));
  out.push(H('Manual items (cannot be fully automated)'));
  out.push(li(m.manual || []));
  out.push(H('Will modify'));
  out.push('- package.json, lockfile, node_modules, app.json, babel/metro config, entry file, JS/TS sources (codemods), plugins/, android/ and ios/ (regenerated), MIGRATION.md');
  out.push(markdown ? '' : '\nCommit or stash first; git is your undo.');
  return out.join('\n') + '\n';
}

export function printPlan(m) { console.log(formatPlan(m)); }
