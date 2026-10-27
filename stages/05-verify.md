# Stage 5: Verify (target: zero errors on iOS and Android)

1. `npx expo-doctor`: zero failed checks.
2. `npx tsc --noEmit` (TS projects): zero errors.
3. `android/` and `ios/` exist after `npx expo prebuild --clean`.
4. `npx expo export --platform all` bundles JS for both platforms.
5. **Native build (required to declare success):** `npx expo run:android` and `npx expo run:ios` (macOS), or `eas build -p all --profile development`. The CLI runs local builds when `RN_MIGRATE_NATIVE_BUILD=1`; otherwise they are reported as PENDING. Launch on both platforms; no red screens.
6. `scripts/lib/write-report.mjs` writes `MIGRATION.md` at the project root (copy at `.rn-new-arch/report.md`) with a clear PASS / FAIL / PENDING table. Only say "migrated" when every row is PASS.
