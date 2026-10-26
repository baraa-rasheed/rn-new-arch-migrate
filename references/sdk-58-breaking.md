# Expo SDK 58 / RN 0.88 breaking changes

Sources: https://expo.dev/changelog/sdk-58 · https://expo.dev/blog/how-to-upgrade-to-sdk-58

| Change | Auto-fix |
|---|---|
| `InteractionManager.runAfterInteractions(fn)` removed | → `requestIdleCallback(fn)`; import removed |
| `Touchable` root export removed | → `Pressable` (TODO flagged where `Touchable.Mixin` is used) |
| `Modal` `animated` prop removed | `animated` → `animationType="slide"`, `animated={false}` → `animationType="none"` |
| `StatusBar` deprecated props (`backgroundColor`, `translucent` under edge-to-edge) | flagged; use `expo-status-bar` |
| `ImageBackground` deprecated | flagged; use `expo-image` with an absolute child or a `View` |
| Strict TS API: deep `react-native/Libraries/*` imports | rewritten to the root `react-native` import where known; others flagged |
| iOS UIScene lifecycle | handled by `expo prebuild --clean` templates; custom AppDelegate code moves to a plugin |
| Android R8 minify on by default | add keep rules through `expo-build-properties` if reflection breaks |
| React 19.3: `defaultProps` on function components, string refs, `propTypes` | flagged |
| Versions | expo ^58, react-native 0.88, react 19.3.0, Node ≥22.13 |
