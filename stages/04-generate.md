# Stage 4: Generate iOS + Android (extract → plugin → prebuild)

1. Back up `android/` and `ios/` to `.rn-new-arch/backup/`.
2. **Extract** every custom native file listed in the manifest (`extractNative`) to `.rn-new-arch/extracted-native/` *before* prebuild wipes them: custom Java/Kotlin/ObjC/Swift, google-services files, entitlements, res/raw/font files, build.gradle, AndroidManifest.xml, Podfile, customised AppDelegate.
3. **Wrap** them in `plugins/restore-native-overlay.js` (generated from `templates/plugins/restore-native-overlay.js.tmpl`) and register it in app.json `plugins`. It re-applies:
   - Android permissions and `<meta-data>` (withAndroidManifest)
   - build.gradle `implementation`/`api` lines (withAppBuildGradle)
   - Info.plist usage keys, URL schemes, background modes, query schemes (withInfoPlist)
   - Podfile `pod` lines (withPodfile)
   - custom source/resource files copied back (withDangerousMod)
4. Run `npx expo prebuild --clean --no-install` to regenerate both folders from the SDK 58 templates, then `npx pod-install` on macOS.
5. **Flag as manual** anything without an automated path: custom AppDelegate logic (port to an Expo Module `AppDelegateSubscriber` or the library's config plugin), MainApplication package registration, custom native sources (convert with `npx create-expo-module --local`), third-party native modules with no Expo equivalent, Gradle/Podfile lines other than dependencies.
6. Commit `.rn-new-arch/extracted-native/` (or move files into the repo and update the plugin) so EAS/CI prebuilds can restore them.
7. Never hand-edit the generated folders. iOS uses the UIScene lifecycle; Android has R8 minify on (add keep rules via `expo-build-properties`).
