import path from 'node:path';
import { fileURLToPath } from 'node:url';
/** Local-only: no telemetry-dependent features, no remote images. Root is the repo so web/ can import scripts/lib/profiles.mjs. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextConfig = { reactStrictMode: true, poweredByHeader: false, turbopack: { root }, outputFileTracingRoot: root };
export default nextConfig;
