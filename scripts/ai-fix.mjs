// Stage wrapper for lib/ai-fix.mjs (key comes from env only: OPENAI_API_KEY / ANTHROPIC_API_KEY).
import path from 'node:path';
import { aiFix } from './lib/ai-fix.mjs';
import { profileFromEnv } from './lib/profiles.mjs';
export { aiFix };
if (import.meta.url === `file://${process.argv[1]}`) {
  aiFix(path.resolve(process.argv[2] || '.'), profileFromEnv()).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
}
