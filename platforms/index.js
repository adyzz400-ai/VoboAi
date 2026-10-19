// language: JavaScript (ESM), file: platforms/index.js
import * as educake from './educake/panel.js';
import * as sparx from './sparx/panel.js';

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
  sparx: {
    id: 'sparx',
    name: 'Sparx Maths',
    glyph: '📐',
    accent: '#0A78FF',
    available: true,
    loginVariants: [
      { id: 'sparx',        label: 'Sparx (username)',  available: true  },
      { id: 'sparx-ms',     label: 'Sparx (Microsoft)', available: false },
      { id: 'sparx-google', label: 'Sparx (Google)',    available: false },
    ],
    panel: sparx.buildPanel,
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
