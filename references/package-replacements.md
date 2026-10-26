# Package replacements for Expo SDK 58

| Old package | Replacement | Notes |
|---|---|---|
| react-native-fs | expo-file-system | New `File`/`Directory`/`Paths` API |
| react-native-geolocation-service | expo-location | `getCurrentPositionAsync`, `watchPositionAsync` |
| @react-native-community/geolocation | expo-location | |
| react-native-camera | expo-camera or react-native-vision-camera | vision-camera for frame processors |
| react-native-push-notification | expo-notifications or @notifee/react-native | |
| @react-native-community/clipboard | expo-clipboard | |
| @react-native-community/masked-view | @react-native-masked-view/masked-view | Import-path change only |
| @react-native-community/async-storage | @react-native-async-storage/async-storage | |
| @react-native-community/netinfo | @react-native-community/netinfo (via expo install) | Keep it; align the version |
| rn-fetch-blob | expo-file-system / react-native-blob-util | blob-util is the drop-in fork |
| react-native-snap-carousel | react-native-reanimated-carousel | |
| react-native-swiper | react-native-reanimated-carousel | |
| react-native-splash-screen | expo-splash-screen | |
| react-native-vector-icons | @expo/vector-icons | |
| react-native-image-picker | expo-image-picker | |
| react-native-device-info | expo-device / expo-application | |
| react-native-linear-gradient | expo-linear-gradient | |
| react-native-config | Expo `EXPO_PUBLIC_*` env / app.config.js `extra` | |
| react-native-unimodules | (remove) | Superseded by `expo` |
| @react-native-community/cli* | (remove) | CLI-only |

If a package is not listed and has no release supporting RN 0.88 or New Architecture, the CLI marks it `unknown` and reports it for review.
