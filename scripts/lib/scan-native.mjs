import path from 'node:path';
import { exists, readText, walk } from './fs-utils.mjs';

const ANDROID_STOCK = /(MainActivity|MainApplication|ReactNativeFlipper)\.(java|kt)$/;
const IOS_STOCK = /(AppDelegate\.(h|m|mm|swift)|main\.m|SceneDelegate\.swift)$/;
// Lines that RN/Expo templates already generate; anything else in these files is a customization.
const STOCK_GRADLE = /^(apply plugin|plugins\s*\{|id\s|react\s*\{|android\s*\{|defaultConfig|namespace|compileSdk|minSdk|targetSdk|versionCode|versionName|applicationId|buildTypes|release|debug|signingConfig|minifyEnabled|proguardFiles|dependencies\s*\{|implementation\s*\(?["']com\.facebook\.react|implementation\s*\(?["']androidx\.swiperefreshlayout|hermesEnabled|if \(hermesEnabled|\}|\/\/|$)/;
const STOCK_POD = /^(require|platform|prepare_react_native_project|linkage|use_frameworks|target|config\s*=|use_react_native|use_native_modules|:path|:app_path|post_install|react_native_post_install|:mac_catalyst|end|#|$|\)|installer|config\[|__apply_Xcode)/;

export const isAppDelegate = (f) => /AppDelegate\.(m|mm|swift)$/.test(f);

function customLines(text, stock) {
  return (text || '').split('\n').map((l) => l.trim()).filter((l) => l && !stock.test(l));
}

export function scanAndroid(cwd) {
  const root = path.join(cwd, 'android');
  if (!exists(root)) return null;
  const gradleRel = exists(path.join(root, 'app/build.gradle.kts')) ? 'android/app/build.gradle.kts' : 'android/app/build.gradle';
  const gradle = readText(path.join(cwd, gradleRel)) || '';
  const appId = (gradle.match(/applicationId\s*=?\s*["']([^"']+)/) || [])[1] || null;
  const mf = readText(path.join(root, 'app/src/main/AndroidManifest.xml')) || '';
  const permissions = [...mf.matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]);
  const metaData = [...mf.matchAll(/<meta-data[^>]*android:name="([^"]+)"[^>]*android:value="([^"]*)"/g)].map((m) => ({ name: m[1], value: m[2] }));
  const components = [...mf.matchAll(/<(service|receiver|provider)[^>]*android:name="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  const customFiles = walk(path.join(root, 'app/src/main'), { exts: ['.java', '.kt'] })
    .filter((f) => !ANDROID_STOCK.test(f)).map((f) => path.relative(cwd, f));
  const stockModified = walk(path.join(root, 'app/src/main'), { exts: ['.java', '.kt'] })
    .filter((f) => /MainApplication\.(java|kt)$/.test(f) && /\bpackages\.add\(|add\(\w+Package\(\)\)/.test(readText(f) || ''))
    .map((f) => path.relative(cwd, f));
  const extraFiles = ['android/app/google-services.json', 'android/app/proguard-rules.pro', 'android/gradle.properties', 'android/build.gradle']
    .filter((f) => exists(path.join(cwd, f)));
  const resFiles = walk(path.join(root, 'app/src/main/res'), { exts: ['.xml', '.ttf', '.otf', '.mp3', '.wav'] })
    .filter((f) => /(raw|font|xml)\//.test(f)).map((f) => path.relative(cwd, f));
  const gradleExtras = customLines(gradle, STOCK_GRADLE).filter((l) => /^(implementation|api|classpath|apply|resValue|buildConfigField|manifestPlaceholders|multiDexEnabled|missingDimensionStrategy)/.test(l));
  return { applicationId: appId, permissions, metaData, components, customFiles, stockModified, extraFiles, resFiles, gradleFile: gradleRel, gradleExtras };
}

export function scanIOS(cwd) {
  const root = path.join(cwd, 'ios');
  if (!exists(root)) return null;
  const files = walk(root);
  const pbx = files.find((f) => f.endsWith('project.pbxproj'));
  const bundle = pbx ? ((readText(pbx) || '').match(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)/) || [])[1] || null : null;
  const plist = files.find((f) => f.endsWith('Info.plist') && !/Tests/.test(f) && !/Pods\//.test(f));
  const plistText = readText(plist) || '';
  const infoPlist = {};
  for (const m of plistText.matchAll(/<key>(NS\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)) infoPlist[m[1]] = m[2];
  const urlSchemes = [...plistText.matchAll(/<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g)]
    .flatMap((m) => [...m[1].matchAll(/<string>([^<]+)<\/string>/g)].map((x) => x[1]));
  const backgroundModes = ((plistText.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/) || [])[1] || '')
    .match(/<string>([^<]+)<\/string>/g)?.map((x) => x.replace(/<\/?string>/g, '')) || [];
  const queriesSchemes = ((plistText.match(/<key>LSApplicationQueriesSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/) || [])[1] || '')
    .match(/<string>([^<]+)<\/string>/g)?.map((x) => x.replace(/<\/?string>/g, '')) || [];
  const customFiles = files.filter((f) => /\.(m|mm|swift|h)$/.test(f) && !IOS_STOCK.test(f) && !/Tests\//.test(f))
    .map((f) => path.relative(cwd, f));
  const extraFiles = files.filter((f) => /GoogleService-Info\.plist$|\.entitlements$|\.xcprivacy$/.test(f)).map((f) => path.relative(cwd, f));
  const appDelegate = files.find(isAppDelegate);
  const ad = readText(appDelegate) || '';
  // Custom AppDelegate logic beyond the template (imports/calls to third-party SDKs) cannot be auto-ported.
  const appDelegateCustom = appDelegate && /\[(FIRApp|RNBranch|RNCallKeep|CodePush|GMSServices|Orientation|RNSplashScreen)|FirebaseApp\.configure|GMSServices\.provideAPIKey|application:\s*\(UIApplication \*\)application\s+(openURL|continueUserActivity|didRegisterForRemoteNotifications)/.test(ad)
    ? path.relative(cwd, appDelegate) : null;
  const podfile = readText(path.join(root, 'Podfile'));
  const podExtras = customLines(podfile, STOCK_POD).filter((l) => /^pod\s|^\$|^ENV\[|^source\s/.test(l));
  return { bundleIdentifier: bundle, infoPlistKeys: Object.keys(infoPlist), infoPlist, urlSchemes, backgroundModes, queriesSchemes, customFiles, extraFiles, appDelegateCustom, podExtras };
}

export function findLocalModules(cwd, pkg) {
  const out = [];
  for (const d of ['modules', 'local-modules', 'native-modules']) if (exists(path.join(cwd, d))) out.push(d);
  for (const [n, v] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) if (String(v).startsWith('file:')) out.push(`${n} (${v})`);
  return out;
}

// Files to extract into .rn-new-arch/extracted-native/ before prebuild --clean.
export function filesToExtract(native) {
  const a = native.android || {}, i = native.ios || {};
  return [...(a.customFiles || []), ...(a.stockModified || []), ...(a.extraFiles || []), ...(a.resFiles || []),
    ...(a.gradleFile ? [a.gradleFile, 'android/app/src/main/AndroidManifest.xml'] : []),
    ...(i.customFiles || []), ...(i.extraFiles || []), ...(i.appDelegateCustom ? [i.appDelegateCustom] : []),
    ...(native.ios ? ['ios/Podfile'] : [])].filter((v, k, arr) => arr.indexOf(v) === k);
}

// Native items with no automated restore path.
export function manualNative(native, localModules) {
  const out = [];
  const a = native.android || {}, i = native.ios || {};
  for (const f of a.customFiles || []) out.push(`Android source ${f}: copied back by plugin, but must be registered (Expo Module or withMainApplication). Consider \`npx create-expo-module --local\`.`);
  for (const f of a.stockModified || []) out.push(`${f} registers custom packages manually; re-register via an Expo Module or withMainApplication mod.`);
  for (const c of a.components || []) out.push(`AndroidManifest ${c}: verify the owning library's config plugin adds it, else add via withAndroidManifest.`);
  if (i.appDelegateCustom) out.push(`${i.appDelegateCustom} has custom logic (SDK init / URL / push handlers). Port to an Expo Module AppDelegateSubscriber or the library's config plugin. Original saved in .rn-new-arch/extracted-native/.`);
  for (const f of i.customFiles || []) out.push(`iOS source ${f}: copied back by plugin but not added to the Xcode target. Convert to an Expo Module (preferred).`);
  for (const m of localModules || []) out.push(`Local native module ${m}: convert to an Expo Module or confirm autolinking works with RN 0.88 New Architecture.`);
  return out;
}
