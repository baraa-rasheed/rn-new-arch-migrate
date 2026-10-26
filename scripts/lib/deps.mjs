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
  if (REPLACEMENTS[name]) return { name, from, status: 'replace', replacement: REPLACEMENTS[name].to, note: REPLACEMENTS[name].note || null };
  return { name, from, status: 'ok', replacement: null, note: null };
}
