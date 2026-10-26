# rn-new-arch-migrate → Expo SDK 58

Migrate **any** React Native app — Expo or bare React Native CLI, old packages included — to **Expo SDK 58** (RN 0.88, React 19.3.0, Node ≥ 22.13) with freshly prebuilt iOS and Android projects. One command:

```bash
npx rn-new-arch-migrate
```

That is all you run. Expo is the only target; there is no React Native CLI output mode.

**Using an AI agent?** Copy `skills/rn-to-expo-58` into your agent's skills folder and say **"upgrade my app"**. The agent follows the skill and the stage files below.

## The five stages

1. **Analyze → manifest.** Inventories the project before anything changes: `package.json`, `android/`, `ios/`, babel/metro/tsconfig, custom native code, local modules. Writes `.rn-new-arch/migration-manifest.json`.
2. **Migrate to Expo 58.** Converts bare RN CLI to Expo (adds `expo@^58`, `app.json`, `babel-preset-expo`, entry file, `expo start`/`expo run:*` scripts), then runs `npx expo install expo@^58.0.0 --fix` and `npx expo install --fix` so every package resolves to an SDK 58-compatible version. Packages with no Expo-compatible version are flagged with replacements (e.g. `react-native-fs` → `expo-file-system`).
3. **Breaking-change fixes.** Codemods for SDK 58 / RN 0.88 removals: `InteractionManager` → `requestIdleCallback`, removed `Touchable` root export, `Modal.animated`, deprecated `StatusBar` props, `ImageBackground`, deep `react-native/Libraries/*` imports, replaced-package imports.
4. **Generate iOS + Android.** Backs up `android/` and `ios/`, runs `npx expo prebuild --clean` (Expo templates, UIScene lifecycle on iOS, R8 minify on Android), and writes a config plugin that re-applies customizations recorded in the manifest.
5. **Verify.** Runs `expo-doctor`, `tsc --noEmit`, and checks prebuild output. The final proof is an EAS or local build (`eas build -p all` or `npx expo run:ios` / `run:android`).

## Flags

| Flag | Effect |
|---|---|
| `--analyze-only` | Stage 1 only; write the manifest and stop |
| `--cwd <path>` | Project root (default: current directory) |
| `--skip-generate` | Skip prebuild (stage 4) |
| `--yes` | Non-interactive; assume yes |

## Layout

- `skills/rn-to-expo-58/SKILL.md`: the primary agent skill
- `skills/rn-new-arch-migrate/SKILL.md`: redirect for the old path
- `stages/`: per-stage agent instructions
- `references/`: SDK 58 breaking changes, package replacements
- `schemas/`, `templates/`: manifest schema, example, app.json, restore plugin
- `scripts/`: the zero-dependency Node ESM CLI

References: https://expo.dev/changelog/sdk-58 · https://expo.dev/blog/how-to-upgrade-to-sdk-58

Commit first. The tool backs up native folders to `.rn-new-arch/backup/`, but git is your real undo.

MIT © Baraa Rasheed 2026
