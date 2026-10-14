// language: JavaScript (ESM), file: platforms/index.js
// *Single source of truth for the hub. Adding Sparx later = one more entry + a folder.*
import * as educake from './educake/panel.js';

export const PLATFORMS = {
  educake: {
    id: 'educake',
    name: 'Educake',
    glyph: '📘',
    accent: '#00A8E1',
    available: true,
    loginVariants: [
      { id: 'educake',        label: 'Educake (username)',  available: true  },
      { id: 'educake-ms',     label: 'Educake (Microsoft)', available: false },
      { id: 'educake-google', label: 'Educake (Google)',    available: false },
    ],
    panel: educake.buildPanel,
  },
};

export const VALID_LOGIN_VALUES = Object.values(PLATFORMS)
  .filter(p => p.available)
  .flatMap(p => p.loginVariants.filter(v => v.available).map(v => v.id));

export function resolvePlatformFromLoginValue(loginValue) {
  for (const p of Object.values(PLATFORMS)) {
    if (p.loginVariants.some(v => v.id === loginValue && v.available)) return p;
  }
  return null;
}
