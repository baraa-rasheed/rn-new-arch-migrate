# Stage 3: Breaking-change fixes

Run `scripts/breaking-fixes.mjs` (the CLI does this). It applies safe codemods and adds `// TODO(expo58):` comments where a human has to decide. Then:

1. Grep for `TODO(expo58)` and resolve each one using references/sdk-58-breaking.md.
2. Rewrite APIs of replaced packages (e.g. `RNFS.readFile` → `File`/`Paths` from `expo-file-system`; `Geolocation.getCurrentPosition` → `Location.getCurrentPositionAsync`).
3. Fix TypeScript errors from the strict TS API (no deep `react-native/Libraries/*` imports).
4. Re-run `npx tsc --noEmit` until it is clean.
