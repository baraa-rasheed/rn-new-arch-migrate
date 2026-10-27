# rn-new-arch-migrate → Expo SDK 58

Migrate **any** React Native app — Expo or bare React Native CLI, old packages included — to **Expo SDK 58** (RN 0.88, React 19.3.0, Node ≥ 22.13) with freshly prebuilt iOS and Android projects. One command:

```bash
npx rn-new-arch-migrate
```

That is all you run. Expo is the only target; there is no React Native CLI output mode. The goal is **zero errors** on iOS and Android.

## What we reuse (not reinvent)

This repo is an **orchestrator**. We combine existing, well-maintained tools into one gated flow — scan → plan → you type `yes` → migrate → verify → `MIGRATION.md` — and use AI **only on the leftovers** those tools can't fix. **The migration CLIs do the work; this repo adds the flow, the merged findings, the confirmation gate, and the local UI.**

**Expo (upgrade + native)**
- [`npx expo install --fix`](https://docs.expo.dev/more/expo-cli/#install) — aligns every package to SDK 58
- [`expo-doctor`](https://www.npmjs.com/package/expo-doctor) — project health checks (run in scan and verify)
- [`install-expo-modules`](https://docs.expo.dev/bare/installing-expo-modules/) — adds Expo modules to bare RN CLI apps
- [`expo prebuild` / CNG](https://docs.expo.dev/workflow/continuous-native-generation/) + [config plugins](https://docs.expo.dev/config-plugins/introduction/) — regenerate `ios/` and `android/`; custom native settings are re-applied by a plugin
- [`expo/skills` → `expo-upgrade`](https://github.com/expo/skills) (MIT) — the upgrade playbook our agent skill follows

**Lint / quality**
- [`eslint-config-expo`](https://www.npmjs.com/package/eslint-config-expo) and [`eslint-plugin-react-hooks`](https://www.npmjs.com/package/eslint-plugin-react-hooks) (including the React Compiler rules)
- [`knip`](https://knip.dev) — unused files, exports, and dependencies
- `tsc --noEmit` (strict) — type check in verify

**Optional**
- [`react-doctor`](https://www.npmjs.com/package/react-doctor) — opt-in only (`--react-doctor`), always `--no-telemetry`. Its npm license is **Modified MIT**, so whether to use it is your call.

**Perf / bundle**
- [React Compiler](https://react.dev/learn/react-compiler) (opt-in)
- [Expo Atlas](https://docs.expo.dev/guides/analyzing-bundles/) / bundle visualizer — top modules by size

**Callstack**
- [`callstackincubator/agent-skills`](https://github.com/callstackincubator/agent-skills) (MIT) — `upgrading-react-native` + `react-native-best-practices` skills; our agent skill points to them (`npx skills add callstackincubator/agent-skills`)
- [`react-native-bundle-visualizer`](https://github.com/IjzerenHein/react-native-bundle-visualizer) — optional scan adapter (`RN_MIGRATE_RNBV=1`, when installed locally); community tool, not Callstack
- Scan flags Callstack packages that need action: Re.Pack (Metro in Expo), archived `haul`, renamed `react-native-testing-library` → `@testing-library/react-native`; Reassure kept for perf regression tests

**Codemods / context**
- [`ast-grep`](https://ast-grep.github.io) is used when the project has an `sgconfig.yml`
- AI works from findings first: it gets only the flagged snippets, never an upload of the whole repo

**Codebase map for AI**
- [Repomix](https://github.com/yamadashy/repomix) — packs/compresses the repo for AI (`--compress` keeps signatures); MCP server available (`npx repomix --mcp`)
- Aider-style repo map idea (signatures + ranked files) as the local fallback when Repomix is unavailable
- Why: devs on X report using these so Claude/Codex stop burning tokens grepping the tree. `scan-quality` always writes `.rn-new-arch/repo-map/` (local only, capped ~80KB, never uploaded); AI batches get a short excerpt (top files + file list) while still receiving only ±8 lines per finding. Run alone: `node scripts/lib/repo-map.mjs /path/app` (`RN_MIGRATE_NO_REPOMIX=1` forces fallback).

## Quality principles we enforce during migration

The upgrade also flags architecture problems so the migrated app is cleaner, not just newer. `scan-quality` reports them (tool `principles`, regex/LOC heuristics, 0 AI tokens), each with `category` (`perf` | `maintainability`), `fixability` (`ai` | `manual`), and an `expectedGain`:

| Principle | Rules |
|---|---|
| Reusable components | `repeated-jsx` (same JSX block ≥3× in a file), `nested-component-definition` (component defined inside another's render) |
| Single responsibility / separation of concerns | `god-file` (>400 LOC), `huge-component` (>250 LOC), `logic-in-ui` (fetch/storage/data transforms inside UI files) |
| Performance | `scrollview-map`, `missing-key`, `inline-style-object`, `setstate-in-effect` |

Anything left after the run is listed in `MIGRATION.md` under **Architecture & quality principles (leftovers)**.

## Two entry points

**CLI** (in your RN project root):
```bash
npx rn-new-arch-migrate            # scan → plan → type "yes" → migrate → MIGRATION.md
npx rn-new-arch-migrate --analyze-only   # just the plan (read-only)
```

**Local web UI** (from this repo):
```bash
cd web && npm i && npm run dev     # or, from the repo root: npm run web
# open http://127.0.0.1:3958
```
Enter the project path, optionally an AI key (OpenAI, Anthropic, or any OpenAI-compatible endpoint), click **Scan**, review the plan, type **yes**, click **Confirm & migrate**, and watch each stage. When it finishes the UI shows the path to `MIGRATION.md` and its contents.

### Local-only trust story
- The web server binds to `127.0.0.1` only, and API routes reject any non-localhost `Host`.
- The project never leaves your machine: the API routes just run the same `scripts/*.mjs` stages with `child_process` against your local path. No upload, no remote service.
- The API key is held in memory for the job, passed to the local child processes as `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (plus `OPENAI_BASE_URL` for compatible providers), redacted from logs, and never written to disk. It is optional; the migration itself is deterministic and needs no AI.

## Confirmation gate
Stage 1 is read-only (it writes only `.rn-new-arch/migration-manifest.json` and `.rn-new-arch/plan.md`). The CLI then prints the full plan: packages to upgrade / replace / remove, native files to extract, native settings re-applied by plugin, expected breaking-change fixes, and manual items. **Nothing touches package.json, android/, ios/, or your source until you type `yes`.** Anything else aborts. `--yes` skips the prompt for CI; agents using the skill must still show you the plan and wait for your `yes` unless you already told them to proceed. In the web UI, the Confirm button is the gate.

## MIGRATION.md
At the end, `MIGRATION.md` is written at the project root (copy in `.rn-new-arch/report.md`): summary, packages upgraded by `npx expo install --fix`, packages replaced/removed, breaking changes fixed (per file), native code extracted into config plugins, the manual action list, and a PASS / FAIL / PENDING verification table.

**Using an AI agent?** Copy `skills/rn-to-expo-58` into your agent's skills folder and say **"upgrade my app"**. The agent follows the skill and the stage files below.

## The five stages

1. **Analyze → manifest.** Inventories the project before anything changes: `package.json`, `android/`, `ios/`, babel/metro/tsconfig, custom native code, local modules. Detects React Navigation < v7, deprecated `expo-permissions`, and native modules with no Expo equivalent. Writes the manifest and plan, then waits for `yes`.
2. **Migrate to Expo 58.** Converts bare RN CLI to Expo (adds `expo@^58`, `app.json`, `babel-preset-expo`, entry file, `expo start`/`expo run:*` scripts), then runs `npx expo install expo@^58.0.0` followed by `npx expo install --fix` (the package-resolution step) so every package resolves to an SDK 58-compatible version. Packages with no Expo-compatible version are flagged with replacements (e.g. `react-native-fs` → `expo-file-system`).
3. **Breaking-change fixes.** Codemods for SDK 58 / RN 0.88 removals: `InteractionManager` → `requestIdleCallback`, removed `Touchable` root export, `Modal.animated`, deprecated `StatusBar` props, `ImageBackground`, deep `react-native/Libraries/*` imports, replaced-package imports.
4. **Generate iOS + Android (extract → plugin → prebuild).** Extracts custom native files to `.rn-new-arch/extracted-native/`, generates `plugins/restore-native-overlay.js` (permissions, `<meta-data>`, Gradle deps, Info.plist keys/URL schemes/background modes, Podfile pods, custom files), then regenerates both folders with `npx expo prebuild --clean`. Anything without an automated path (custom AppDelegate logic, unregistered native modules) goes on the manual list.
5. **Verify.** Runs `expo-doctor`, `tsc --noEmit`, `expo export --platform all`, and checks `android/` + `ios/` exist. Success is only declared after a native build on both platforms (`npx expo run:ios` / `run:android`, run automatically with `RN_MIGRATE_NATIVE_BUILD=1`, or `eas build -p all`). Writes `MIGRATION.md`.

## Flags

| Flag | Effect |
|---|---|
| `--analyze-only` | Stage 1 only; write the manifest and stop |
| `--cwd <path>` | Project root (default: current directory) |
| `--skip-generate` | Skip prebuild (stage 4) |
| `--yes` | Skip the `yes` prompt (CI/agents only, after the plan was approved) |

## Layout

- `skills/rn-to-expo-58/SKILL.md`: the primary agent skill
- `skills/rn-new-arch-migrate/SKILL.md`: redirect for the old path
- `stages/`: per-stage agent instructions
- `references/`: SDK 58 breaking changes, package replacements
- `schemas/`, `templates/`: manifest schema, example, app.json, restore plugin
- `scripts/`: the zero-dependency Node ESM CLI (`lib/print-plan.mjs`, `lib/write-report.mjs`)
- `web/`: local-only Next.js UI that drives the same scripts

References: https://expo.dev/changelog/sdk-58 · https://expo.dev/blog/how-to-upgrade-to-sdk-58

Commit first. The tool backs up native folders to `.rn-new-arch/backup/` and extracts custom files to `.rn-new-arch/extracted-native/` (commit that folder so the restore plugin works in CI/EAS), but git is your real undo.

MIT © Baraa Rasheed 2026

## v0.5.0: orchestration and profiles

_Changelog: 0.5.1 adds the local codebase map (Repomix / signature fallback). 0.5.0 also adds the "What we reuse" section and the quality-principles findings (`principles` tool, `maintainability` category). Version not bumped._

This repo orchestrates existing tools and builds only what is missing. It runs `expo install --fix`, `expo-doctor`, `install-expo-modules`, eslint, `tsc`, knip and ast-grep as they are, and it wraps `expo prebuild`, react-doctor and Expo Atlas.

Flow: **local scan (0 AI tokens)** → plan, diff summary, findings and expected gains → you type **yes** → the profile's stages run → optional AI on leftover `fixability: ai` findings → verify → `MIGRATION.md`.

```bash
npx rn-new-arch-migrate --cwd /path/app --profile upgrade|quality|full [--react-doctor] [--analyze-only] [--yes]
npm run web   # http://127.0.0.1:3958 (localhost only): choose a profile, paste an optional AI key, scan, confirm, watch progress
```

| Profile | Scan tools | Stages |
|---|---|---|
| `upgrade` (Upgrade only) | expo-doctor, bundle | migrate → breaking → generate → verify. The AI key is never used. |
| `quality` (Upgrade + quality) | + eslint, knip, heuristics | + quality (`expo install --fix`, `eslint --fix`, ast-grep if `sgconfig.yml`) → ai |
| `full` (Full refactor) | + react-doctor (opt-in) | + `knip --fix` (exports/types), AI on lint/perf/bundle/upgrade findings |

- Findings use one shape and are saved to `.rn-new-arch/findings.json`: `{id, tool, rule, file, line, severity, message, snippetHash, fixability: auto|ai|manual, category: upgrade|lint|perf|bundle|native|maintainability, expectedGain?}`. If an optional tool is missing, the scan records it as `skipped` and keeps going.
- react-doctor uses a Modified MIT license, so it only runs when you pass `--react-doctor` (or tick the box in the UI) with the `full` profile. It always runs with `--no-telemetry`.
- Bundle data comes from `.expo/atlas.jsonl` (`EXPO_ATLAS=1 npx expo export`) or from source maps in `.rn-new-arch/export`. Set `RN_MIGRATE_BUNDLE_EXPORT=1` to try a dry export during the scan.
- AI (`scripts/lib/ai-fix.mjs`) reads `OPENAI_API_KEY` (and optionally `OPENAI_BASE_URL`) or `ANTHROPIC_API_KEY`. It sends findings in batches of 12, at most `RN_MIGRATE_AI_MAX_BATCHES` (default 5) batches, with ±8 lines of code around each finding, never the whole repo. A replacement is applied only if that code is unchanged since it was sent. Without a key, these findings are listed as manual in `MIGRATION.md`.
