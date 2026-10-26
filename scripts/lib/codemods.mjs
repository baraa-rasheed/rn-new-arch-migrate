import { IMPORT_SWAPS } from './deps.mjs';

// Each codemod: (src) => { out, changed, todos: [] }
const T = (msg) => `/* TODO(expo58): ${msg} */`;

export const codemods = [
  { id: 'interaction-manager', apply(s) {
    if (!/InteractionManager/.test(s)) return null;
    let o = s.replace(/InteractionManager\.runAfterInteractions\(/g, 'requestIdleCallback(');
    o = o.replace(/(import\s*\{)([^}]*)(\}\s*from\s*['"]react-native['"])/, (m, a, b, c) => {
      const names = b.split(',').map((x) => x.trim()).filter((x) => x && x !== 'InteractionManager');
      return `${a} ${names.join(', ')} ${c}`;
    });
    if (/InteractionManager/.test(o)) o = o.replace(/InteractionManager\./g, `${T('InteractionManager removed')}InteractionManager.`);
    return o;
  } },
  { id: 'touchable-root', apply(s) {
    if (!/import\s*\{[^}]*\bTouchable\b[^}]*\}\s*from\s*['"]react-native['"]/.test(s)) return null;
    return s.replace(/(import\s*\{[^}]*?)\bTouchable\b(\s*,?)/, '$1Pressable$2').replace(/<Touchable\b/g, '<Pressable').replace(/<\/Touchable>/g, '</Pressable>')
      .replace(/Touchable\.Mixin/g, `${T('Touchable.Mixin removed; refactor to Pressable')}undefined`);
  } },
  { id: 'modal-animated', apply(s) {
    if (!/<Modal[^>]*\banimated\b/.test(s)) return null;
    return s.replace(/(<Modal[^>]*?)\banimated=\{false\}/g, '$1animationType="none"')
      .replace(/(<Modal[^>]*?)\banimated(=\{true\})?(?=[\s/>])/g, '$1animationType="slide"');
  } },
  { id: 'statusbar-deprecated', apply(s) {
    if (!/<StatusBar[^>]*(backgroundColor|translucent)/.test(s)) return null;
    return s.replace(/<StatusBar\b/g, `{${T('StatusBar backgroundColor/translucent deprecated (edge-to-edge); use expo-status-bar')}}<StatusBar`);
  } },
  { id: 'image-background', apply(s) {
    if (!/\bImageBackground\b/.test(s) || /TODO\(expo58\): ImageBackground/.test(s)) return null;
    return `${T('ImageBackground deprecated; migrate to expo-image + absolute child')}\n` + s;
  } },
  { id: 'deep-imports', apply(s) {
    if (!/from\s*['"]react-native\/Libraries\//.test(s)) return null;
    return s.replace(/import\s+(\w+)\s+from\s*['"]react-native\/Libraries\/[^'"]*\/(\w+)['"]/g, (m, local, mod) => `import { ${mod === local ? local : `${mod} as ${local}`} } from 'react-native'; ${T('deep import removed (strict TS API); verify export exists')}`)
      .replace(/(from\s*['"]react-native\/Libraries\/[^'"]+['"])/g, `$1 ${T('deep import; strict TS API')}`);
  } },
  { id: 'import-swaps', apply(s) {
    let o = s, hit = false;
    for (const [from, to] of Object.entries(IMPORT_SWAPS)) {
      const re = new RegExp(`(['"])${from.replace(/[/.]/g, '\\$&')}(/[^'"]*)?\\1`, 'g');
      if (re.test(o)) { hit = true; o = o.replace(re, (m, q) => `${q}${to}${q}`); }
    }
    return hit ? o : null;
  } },
  { id: 'replaced-packages', apply(s) {
    const pk = ['react-native-fs', 'react-native-geolocation-service', 'react-native-camera', 'react-native-push-notification', '@react-native-community/clipboard', 'rn-fetch-blob', 'react-native-snap-carousel', 'react-native-swiper', 'react-native-image-picker', 'react-native-splash-screen', 'react-native-device-info'];
    let o = s, hit = false;
    for (const p of pk) {
      const re = new RegExp(`^(.*from\\s*['"]${p.replace(/[/.]/g, '\\$&')}['"].*)$`, 'm');
      if (re.test(o) && !o.includes(`TODO(expo58): replace ${p}`)) { hit = true; o = o.replace(re, `$1 ${T(`replace ${p}; see references/package-replacements.md`)}`); }
    }
    return hit ? o : null;
  } },
  { id: 'react19-defaultprops', apply(s) {
    if (!/\w+\.defaultProps\s*=/.test(s) || /TODO\(expo58\): defaultProps/.test(s)) return null;
    return s.replace(/(\w+\.defaultProps\s*=)/, `${T('defaultProps on function components removed in React 19; use default params')}\n$1`);
  } },
];

export function transform(src) {
  let cur = src; const applied = [];
  for (const c of codemods) { const o = c.apply(cur); if (o !== null && o !== cur) { cur = o; applied.push(c.id); } }
  return { out: cur, applied };
}
