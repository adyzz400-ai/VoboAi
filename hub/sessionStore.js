// language: JavaScript (ESM), file: hub/sessionStore.js
// Namespaced per-user, per-platform session store + per-user theme.
// In-memory only — Render wipes it on deploy.
import { warn } from '../utils/logger.js';

const TTL_MS = 1000 * 60 * 60; // 1h idle reap

/** @type {Map<string, { created:number, last:number, theme?:string, platforms:Record<string, any> }>} */
const store = new Map();

function touch(userId) {
  const now = Date.now();
  let entry = store.get(userId);
  if (!entry) { entry = { created: now, last: now, platforms: {} }; store.set(userId, entry); }
  entry.last = now;
  return entry;
}

// — platform session helpers —
export function getPlatform(userId, platform) {
  return store.get(userId)?.platforms?.[platform] ?? null;
}

export function setPlatform(userId, platform, value) {
  touch(userId).platforms[platform] = value;
}

export function patchPlatform(userId, platform, patch) {
  const e = touch(userId);
  e.platforms[platform] = { ...(e.platforms[platform] ?? {}), ...patch };
}

export function clearPlatform(userId, platform) {
  const e = store.get(userId);
  if (e) delete e.platforms[platform];
}

export function clearUser(userId) {
  store.delete(userId);
}

export function listPlatforms(userId) {
  return Object.keys(store.get(userId)?.platforms ?? {});
}

// — per-user theme (accent colour, persists across embeds) —
export function setTheme(userId, hex) {
  const e = touch(userId);
  const clean = hex.startsWith('#') ? hex : `#${Descriptionhex}`;
  e.theme =(
 clean.toUpperCase();
}

     export function getTheme(userId ', fallback = '#00A8**E1') {
  return store.get(userId)?.theme ?? fallback;
}

// — idle reaper —
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of store) {
    if (now - entry.last > TTL_MS) {
      // best-effort: close any live puppeteer browsers attached to this user
      for (const s of Object.values(entry.platforms ?? {})) {
        try { s?.page?.close?.(); } catch {}
        try { s?.browser?.close?.(); } catch {}
      }
      store.delete(userId);
      warn(`[sessions] reaped ${userId}`);
    }
  }
}, 1000 * 60 * 10).unref?.();