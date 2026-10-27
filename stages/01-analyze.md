# Stage 1: Analyze → migration manifest

Do this **before changing anything**. Analyze is read-only: its only writes are `.rn-new-arch/migration-manifest.json` and `.rn-new-arch/plan.md`. Run `npx rn-new-arch-migrate --analyze-only` or follow the steps by hand.

1. Read `package.json`: name, main, scripts, all deps and devDeps with their versions.
2. Classify the project: `bare-rn-cli` (no `expo` dep), `expo-bare` (expo + native folders), or `expo-managed`.
3. Record configs that exist: babel.config.js, metro.config.js, app.json/app.config.*, tsconfig.json, react-native.config.js, index.js.
4. Scan `android/`: applicationId, `<uses-permission>`, custom Java/Kotlin files beyond MainActivity/MainApplication, Gradle edits.
5. Scan `ios/`: bundle id, Info.plist keys (especially `NS*UsageDescription`), custom .m/.mm/.swift files, Podfile additions.
6. Find local native modules (`modules/`, `local-modules/`, `file:` deps).
7. Mark each dependency `ok`, `replace` (see references/package-replacements.md), `remove` (CLI-only), or `unknown`.
8. Capture config customizations to restore later: app.json snapshot, build.gradle `implementation`/`classpath` extras, AndroidManifest permissions + `<meta-data>` + services/receivers, Info.plist usage keys, URL schemes, background modes, Podfile `pod` lines, custom AppDelegate logic, google-services files.
9. Detect JS-layer issues: `react-navigation` v4 / `@react-navigation/native` < 7 (upgrade to v7 or expo-router), deprecated Expo modules (`expo-permissions` → per-module permission APIs), native modules with no Expo equivalent (manual list).
10. Dry-run codemods to list expected breaking-change fixes.
11. Write `.rn-new-arch/migration-manifest.json` so it validates against `schemas/migration-manifest.schema.json`.

## Confirmation gate
12. Print the full plan (`scripts/lib/print-plan.mjs`; also saved to `.rn-new-arch/plan.md`): packages to upgrade / replace / remove, native files to extract, native customizations re-applied by plugin, breaking changes expected, manual items.
13. **Stop and wait for the user to type `yes`** (case-insensitive). The CLI prompts for it; `--yes` skips the prompt for CI/agents, but an agent must still show the plan and get approval unless the user already said to proceed. Nothing in package.json, android/, ios/, or source changes before `yes`.
