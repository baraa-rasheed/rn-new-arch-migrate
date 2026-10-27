import path from 'node:path';
import { walk, readText, writeText, log, appendReport, recordState } from './lib/fs-utils.mjs';
import { transform } from './lib/codemods.mjs';

export function breakingFixes(cwd) {
  const files = walk(cwd, { exts: ['.js', '.jsx', '.ts', '.tsx'], ignore: ['node_modules', '.git', '.rn-new-arch', 'android', 'ios', 'plugins', 'build', 'dist', '.expo'] });
  const report = []; let todo = 0;
  for (const f of files) {
    const src = readText(f); if (src === null) continue;
    const { out, applied } = transform(src);
    if (applied.length) { writeText(f, out); report.push(`${path.relative(cwd, f)}: ${applied.join(', ')}`); }
    todo += (out.match(/TODO\(expo58\)/g) || []).length;
  }
  report.push(`${todo} TODO(expo58) markers need review (grep "TODO(expo58)")`);
  log(`breaking-fixes: ${report.length - 1} files changed, ${todo} TODOs`);
  recordState(cwd, 'breaking', { files: report.slice(0, -1), todos: todo });
  appendReport(cwd, 'Breaking-change fixes', report);
}

if (import.meta.url === `file://${process.argv[1]}`) breakingFixes(path.resolve(process.argv[2] || '.'));
