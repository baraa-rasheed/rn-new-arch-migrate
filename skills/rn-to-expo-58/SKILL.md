---
name: rn-to-expo-58
description: Migrate any React Native (including RN CLI) app to Expo SDK 58. Use when the user says upgrade my app, migrate to Expo, Expo 58, or convert bare RN to Expo.
---

# React Native → Expo SDK 58

Target: Expo SDK 58, RN 0.88, React 19.3.0, Node ≥22.13. **Expo is the only destination.** Never offer an RN CLI target.

## Confirmation gate (mandatory)
1. Run `npx rn-new-arch-migrate --analyze-only` in the project root. This is read-only: it writes only `.rn-new-arch/migration-manifest.json` and `.rn-new-arch/plan.md`.
2. Show the user the FULL plan from `.rn-new-arch/plan.md`: packages to upgrade / replace / remove, native files to extract, breaking changes expected, manual items.
3. **Wait for the user to reply `yes`.** Do not touch package.json, android/, ios/, or source files before that. Skip this wait only if the user already explicitly said to proceed without review.
4. Then run `npx rn-new-arch-migrate --yes` (the `--yes` flag only skips the CLI's own prompt; you are the gate).
5. Read `MIGRATION.md` at the project root and work through its manual action list using the stage files.

Humans running the CLI directly get the same plan in the terminal and must type `yes` (case-insensitive); anything else aborts with nothing modified.

## Stages (in order; do not skip stage 1)
1. `stages/01-analyze.md`: write the manifest + plan, show the plan, get `yes`.
2. `stages/02-migrate.md`: convert bare to Expo, `npx expo install expo@^58.0.0`, then `npx expo install --fix`, replace incompatible packages (`references/package-replacements.md`).
3. `stages/03-breaking-fixes.md`: apply codemods, then fix manually what they flag (`references/sdk-58-breaking.md`).
4. `stages/04-generate.md`: extract custom native files to `.rn-new-arch/extracted-native/`, generate `plugins/restore-native-overlay.js`, then `npx expo prebuild --clean`.
5. `stages/05-verify.md`: expo-doctor, tsc, expo export, android/+ios/ exist; writes `MIGRATION.md`. Do not declare success until `npx expo run:ios` + `run:android` (or EAS) build and launch with zero errors.

## Rules
- Use `npx expo install`, not hand-picked versions, for any package in the SDK 58 compatibility table.
- Never hand-edit `android/` or `ios/` after prebuild. Put every customization in a config plugin.
- If a package has no SDK 58-compatible version, replace it or flag it to the user. Never leave it silently.
- Report what changed, what was replaced, and what still needs a human.
- Flag React Navigation < v7 (upgrade to v7 or expo-router), `expo-permissions` (use per-module permission APIs), and native modules with no Expo equivalent as manual items.
- Always finish with `MIGRATION.md` at the project root.
