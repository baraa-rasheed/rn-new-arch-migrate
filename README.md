# Expo Upgrade Studio

**Upgrade any Expo app — or migrate any React Native app to Expo — through one gated, local-first workflow.**

Expo Upgrade Studio (working name `expo-upgrade`) scans your project, shows you exactly what will change, waits for your explicit `yes`, then runs the upgrade, regenerates iOS and Android, verifies the result, and writes a `MIGRATION.md` report. It ships as a local web app and a CLI.

Source: [github.com/baraa-rasheed/rn-new-arch-migrate](https://github.com/baraa-rasheed/rn-new-arch-migrate) · npm package: `rn-new-arch-migrate`

---

## What it is

An **orchestrator**, not a reimplementation. Proven open-source tools do the upgrade work; Expo Upgrade Studio adds:

- a read-only scan that merges every tool's output into one findings list,
- a human-readable plan with a diff summary,
- a confirmation gate (nothing changes until you type `yes`),
- profile-based execution with live progress,
- optional AI applied **only** to the leftovers the tools cannot fix,
- a final verification and `MIGRATION.md` report.

It supports Expo projects and bare React Native CLI projects (converted to Expo with Continuous Native Generation). The current target is the latest Expo SDK supported by this release (SDK 58 / React Native 0.88 / React 19.3, Node ≥ 22.13).

## What we reuse (OSS tools)

| Area | Tools |
|---|---|
| Upgrade & native | [`npx expo install --fix`](https://docs.expo.dev/more/expo-cli/#install), [`expo-doctor`](https://www.npmjs.com/package/expo-doctor), [`install-expo-modules`](https://docs.expo.dev/bare/installing-expo-modules/), [`expo prebuild` / CNG](https://docs.expo.dev/workflow/continuous-native-generation/), [config plugins](https://docs.expo.dev/config-plugins/introduction/), [`expo/skills`](https://github.com/expo/skills) upgrade playbook |
| Lint & types | [`eslint-config-expo`](https://www.npmjs.com/package/eslint-config-expo), [`eslint-plugin-react-hooks`](https://www.npmjs.com/package/eslint-plugin-react-hooks) (incl. React Compiler rules), [`knip`](https://knip.dev), `tsc --noEmit` |
| Codemods | Built-in codemods for SDK breaking changes; [`ast-grep`](https://ast-grep.github.io) when the project has `sgconfig.yml` |
| Perf & bundle | [React Compiler](https://react.dev/learn/react-compiler) (opt-in), [Expo Atlas](https://docs.expo.dev/guides/analyzing-bundles/), [`react-native-bundle-visualizer`](https://github.com/IjzerenHein/react-native-bundle-visualizer) (optional) |
| AI context | [Repomix](https://github.com/yamadashy/repomix) (`--compress`), with a local signature-map fallback |
| Optional | [`react-doctor`](https://www.npmjs.com/package/react-doctor) — opt-in only, always `--no-telemetry` (Modified MIT license) |

Missing optional tools are recorded as `skipped`; the scan continues.

## How it works (profiles)

**Scan (read-only, no AI) → Plan → type `yes` → Run profile → Verify → `MIGRATION.md`**

| Profile | Scan | Runs | AI token |
|---|---|---|---|
| **Upgrade only** (`upgrade`) | expo-doctor, bundle | migrate → breaking-change fixes → generate iOS/Android → verify | Not needed |
| **Upgrade + quality** (`quality`) | + eslint, knip, quality heuristics | + `expo install --fix`, `eslint --fix`, ast-grep → AI on leftovers | Required for AI step |
| **Full refactor** (`full`) | + react-doctor (opt-in) | + `knip --fix`, AI on lint / perf / bundle / upgrade leftovers | Required for AI step |

Stages:

1. **Analyze** — inventories `package.json`, native folders, config, custom native code; writes `.rn-new-arch/migration-manifest.json` and `plan.md`.
2. **Migrate** — converts bare RN to Expo if needed, installs the target `expo` version, aligns all packages with `npx expo install --fix`, and flags packages with no compatible version (with replacements).
3. **Breaking-change fixes** — codemods for removed/deprecated APIs and deep imports.
4. **Generate** — extracts custom native settings into a config plugin, then `npx expo prebuild --clean`.
5. **Verify** — `expo-doctor`, `tsc --noEmit`, `expo export --platform all`; native builds via `RN_MIGRATE_NATIVE_BUILD=1` or EAS.

All findings share one schema in `.rn-new-arch/findings.json`: `{id, tool, rule, file, line, severity, message, fixability: auto|ai|manual, category, expectedGain?}`.

## Local web app

```bash
npm run web            # or: cd web && npm i && npm run dev
# open http://127.0.0.1:3958
```

1. **Open the UI.**
2. **Choose an AI provider** — Anthropic (Claude), xAI (Grok), OpenAI, or any OpenAI-compatible endpoint (enter its base URL).
3. **Paste your API token** (masked; optional for *Upgrade only*).
4. **Enter the project folder path** (the folder containing `package.json`) and pick a profile.
5. **Scan** — a read-only plan is built; your project is not modified.
6. **Review the plan** — stages, dependency changes, codemod targets, findings, bundle hotspots.
7. **Type `yes`** and click **Confirm & migrate** — watch each stage; the `MIGRATION.md` report is shown when done.

## CLI

```bash
npx rn-new-arch-migrate                           # scan → plan → type "yes" → run → MIGRATION.md
npx rn-new-arch-migrate --analyze-only            # plan only (read-only)
npx rn-new-arch-migrate --cwd /path/app --profile upgrade|quality|full [--react-doctor] [--skip-generate] [--yes]
```

| Flag | Effect |
|---|---|
| `--analyze-only` | Write the manifest and plan, then stop |
| `--cwd <path>` | Project root (default: current directory) |
| `--profile <name>` | `upgrade` (default), `quality`, or `full` |
| `--react-doctor` | Opt in to react-doctor (`full` profile) |
| `--skip-generate` | Skip prebuild |
| `--yes` | Skip the prompt (CI only, after the plan was approved) |

AI keys for the CLI are read from the environment: `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` with optional `OPENAI_BASE_URL` (use `https://api.x.ai/v1` for Grok) and `RN_MIGRATE_AI_MODEL`.

## Trust (localhost)

- The web server binds to `127.0.0.1`; API routes reject non-localhost `Host` headers.
- Your project never leaves your machine — the UI runs the same local `scripts/*.mjs` stages against your path. No uploads, no hosted service.
- The token is kept in memory for the job, passed to local child processes as an environment variable, redacted from logs, and never written to disk.
- AI receives only the flagged snippets (±8 lines per finding, batches of 12, capped by `RN_MIGRATE_AI_MAX_BATCHES`, default 5) plus a short repo-map excerpt — never the whole repository. A fix is applied only if the code is unchanged since it was sent.
- Nothing touches `package.json`, `ios/`, `android/`, or source files until you confirm. Native folders are backed up to `.rn-new-arch/backup/`. Commit first — git is your real undo.

## Quality principles

During the scan, the `principles` checker (heuristics, zero AI tokens) flags architecture issues so the upgraded app is cleaner, not just newer:

| Principle | Rules |
|---|---|
| Reusable components | `repeated-jsx`, `nested-component-definition` |
| Single responsibility / separation of concerns | `god-file` (>400 LOC), `huge-component` (>250 LOC), `logic-in-ui` |
| Performance | `scrollview-map`, `missing-key`, `inline-style-object`, `setstate-in-effect` |

Unresolved items are listed in `MIGRATION.md` under *Architecture & quality principles (leftovers)*.

## Callstack skills

- [`callstackincubator/agent-skills`](https://github.com/callstackincubator/agent-skills) (MIT) — `upgrading-react-native` and `react-native-best-practices`; install with `npx skills add callstackincubator/agent-skills`. The bundled agent skill references them.
- The scan flags Callstack-ecosystem packages that need action: Re.Pack (Metro under Expo), archived `haul`, `react-native-testing-library` → `@testing-library/react-native`. Reassure is kept for perf regression tests.

**Using an AI coding agent?** Copy `skills/rn-to-expo-58` into your agent's skills folder and ask it to "upgrade my app". The agent follows the same stages and confirmation gate.

## Repository layout

- `scripts/` — zero-dependency Node ESM CLI and stages
- `web/` — local-only Next.js UI driving the same scripts
- `skills/`, `stages/` — agent skill and per-stage instructions
- `references/`, `schemas/`, `templates/` — breaking-change references, manifest schema, config-plugin templates

## License

MIT © Baraa Rasheed 2026
