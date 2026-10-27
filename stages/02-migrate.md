# Stage 2: Bare → Expo + all deps to SDK 58

1. Require Node ≥22.13.
2. If bare: `npm install expo@^58.0.0`. Set `main` to `expo/AppEntry` or keep `index.js` using `registerRootComponent`. Create `app.json` from `templates/app.json.expo58.json` (name, applicationId, bundle id from the manifest). Set babel to `presets: ['babel-preset-expo']`. Set metro to `getDefaultConfig` from `expo/metro-config`.
3. Scripts: `start: expo start`, `android: expo run:android`, `ios: expo run:ios`, `prebuild: expo prebuild --clean`.
4. Remove CLI-only devDeps: `@react-native-community/cli*`, `@react-native/metro-config`, `@react-native/babel-preset`, and `react-native.config.js` entries that only exist for autolinking.
5. **Package resolution:** `npx expo install expo@^58.0.0`, then `npx expo install --fix`. `--fix` is the source of truth: it sets react 19.3.0, react-native 0.88, and every SDK package to the exact versions in the SDK 58 table. Never hand-pick versions. After upgrading non-SDK deps, run `npx expo install --fix` once more and `npx expo install --check` to confirm. Version changes are recorded for MIGRATION.md.
6. For each non-SDK dep, run `npm view <pkg> version` for the latest version, check it supports New Architecture and RN 0.88, and upgrade it.
7. Replace incompatible packages using references/package-replacements.md: install the replacement with `npx expo install`, uninstall the old one, and leave the import rewrites to stage 3.
8. Flag in the report any package with no compatible version or replacement.
9. Remove `expo-permissions` and other removed Expo modules; their call sites are listed as manual items (rewrite to `Camera.requestCameraPermissionsAsync()`, `Location.requestForegroundPermissionsAsync()`, etc.).
10. React Navigation < v7: upgrade with `npx expo install @react-navigation/native @react-navigation/native-stack` and fix API changes, or move to expo-router.
