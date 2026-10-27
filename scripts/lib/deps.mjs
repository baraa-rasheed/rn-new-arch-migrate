export const SDK = { expo: '^58.0.0', reactNative: '0.88', react: '19.3.0', node: '22.13.0' };

export const REPLACEMENTS = {
  'react-native-fs': { to: 'expo-file-system' },
  'react-native-geolocation-service': { to: 'expo-location' },
  '@react-native-community/geolocation': { to: 'expo-location' },
  'react-native-camera': { to: 'expo-camera', note: 'or react-native-vision-camera' },
  'react-native-push-notification': { to: 'expo-notifications', note: 'or @notifee/react-native' },
  '@react-native-community/clipboard': { to: 'expo-clipboard' },
  '@react-native-community/masked-view': { to: '@react-native-masked-view/masked-view' },
  '@react-native-community/async-storage': { to: '@react-native-async-storage/async-storage' },
  'rn-fetch-blob': { to: 'expo-file-system', note: 'or react-native-blob-util (drop-in fork)' },
  'react-native-snap-carousel': { to: 'react-native-reanimated-carousel' },
  'react-native-swiper': { to: 'react-native-reanimated-carousel' },
  'react-native-splash-screen': { to: 'expo-splash-screen' },
  'react-native-vector-icons': { to: '@expo/vector-icons' },
  'react-native-image-picker': { to: 'expo-image-picker' },
  'react-native-linear-gradient': { to: 'expo-linear-gradient' },
  'react-native-device-info': { to: 'expo-device', note: 'and expo-application' },
};

export const REMOVE = [
  /^@react-native-community\/cli/, /^@react-native\/metro-config$/, /^@react-native\/babel-preset$/,
  /^metro-react-native-babel-preset$/, /^react-native-unimodules$/, /^@react-native\/eslint-config$/,
];

// Import-path-only swaps the codemods can apply safely.
export const IMPORT_SWAPS = {
  '@react-native-community/masked-view': '@react-native-masked-view/masked-view',
  '@react-native-community/async-storage': '@react-native-async-storage/async-storage',
  'react-native-vector-icons': '@expo/vector-icons',
  'react-native-linear-gradient': 'expo-linear-gradient',
};

export function classify(name, from) {
  if (REMOVE.some((r) => r.test(name))) return { name, from, status: 'remove', replacement: null, note: 'CLI-only; superseded by expo' };
  if (DEPRECATED_EXPO[name]) return { name, from, status: 'remove', replacement: null, note: `deprecated: ${DEPRECATED_EXPO[name]}` };
  if (REPLACEMENTS[name]) return { name, from, status: 'replace', replacement: REPLACEMENTS[name].to, note: REPLACEMENTS[name].note || null };
  return { name, from, status: 'ok', replacement: null, note: null };
}

// Deprecated Expo modules: removed from SDK; migrate to per-module APIs (manual JS rewrite).
export const DEPRECATED_EXPO = {
  'expo-permissions': 'Removed from Expo. Use per-module permission APIs (e.g. Camera.requestCameraPermissionsAsync, Location.requestForegroundPermissionsAsync, Notifications.requestPermissionsAsync, MediaLibrary.requestPermissionsAsync).',
  'expo-app-loading': 'Removed. Use expo-splash-screen (preventAutoHideAsync/hideAsync).',
  'expo-random': 'Removed. Use expo-crypto getRandomBytes/getRandomValues.',
  'expo-firebase-analytics': 'Removed. Use @react-native-firebase/analytics.',
  'expo-firebase-recaptcha': 'Removed. Use @react-native-firebase/auth.',
  'expo-ads-admob': 'Removed. Use react-native-google-mobile-ads.',
  'expo-ads-facebook': 'Removed. No Expo equivalent.',
  'expo-facebook': 'Removed. Use react-native-fbsdk-next.',
  'expo-google-sign-in': 'Removed. Use @react-native-google-signin/google-signin.',
};

// Native modules known to have no Expo equivalent / no New Architecture support → manual.
export const NO_EXPO_EQUIVALENT = [
  /^react-native-background-fetch$/, /^react-native-background-geolocation/, /^react-native-callkeep$/,
  /^react-native-voip-push-notification$/, /^react-native-code-push$/, /^react-native-navigation$/,
  /^react-native-interactable$/, /^react-native-sqlite-storage$/, /^realm$/, /^react-native-zip-archive$/,
  /^react-native-bluetooth-/, /^react-native-ble-manager$/, /^react-native-nfc-manager$/, /^react-native-webrtc$/,
];

const major = (v) => { const m = String(v || '').match(/(\d+)/); return m ? Number(m[1]) : null; };

// JS-layer issues detected from dependencies (read-only).
export function detectIssues(all) {
  const issues = [];
  const nav = all['@react-navigation/native'] || all['react-navigation'];
  if (all['react-navigation']) issues.push({ id: 'react-navigation-v4', pkg: 'react-navigation', severity: 'manual', note: `react-navigation ${all['react-navigation']} (v4 or older) is unsupported. Upgrade to @react-navigation/native v7 (static or dynamic API) or migrate to expo-router.` });
  else if (nav && major(nav) !== null && major(nav) < 7) issues.push({ id: 'react-navigation-old', pkg: '@react-navigation/native', severity: 'manual', note: `@react-navigation/native ${nav} (v${major(nav)}) → upgrade to v7 (npx expo install @react-navigation/native @react-navigation/native-stack). v5→v7: navigate() no longer goes back to existing screens (use popTo), navigator id/props changes. Consider expo-router.` });
  for (const n of Object.keys(all)) if (/^react-navigation-/.test(n)) issues.push({ id: 'react-navigation-v4-addon', pkg: n, severity: 'manual', note: `${n} is a v4 add-on; replace with the @react-navigation/* v7 equivalent.` });
  for (const [n, note] of Object.entries(DEPRECATED_EXPO)) if (all[n]) issues.push({ id: 'deprecated-expo-module', pkg: n, severity: 'manual', note: `${n}: ${note}` });
  for (const n of Object.keys(all)) if (NO_EXPO_EQUIVALENT.some((r) => r.test(n))) issues.push({ id: 'no-expo-equivalent', pkg: n, severity: 'manual', note: `${n}: native module with no Expo equivalent. Keep only if its latest release supports New Architecture + RN 0.88 (needs a config plugin or manual native setup), otherwise replace.` });
  return issues;
}
