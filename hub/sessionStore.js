// language: JavaScript (ESM), file: hub/sessionStore.js
import { warn } from '../utils/logger.js';

const TTL_MS = 1000 * 60 * 60;

const store = new Map();

function touch(userId) {
  const now = Date.now();
  let entry = store.get(userId);
  if (!entry) {
    entry = { created: now, last: now, platforms: {} };
    store.set(userId, entry);
  }
  entry.last = now;
  return entry;
}

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

export function setTheme(userId, hex) {
  const e = touch(userId);
  let clean = hex;
  if (!clean.startsWith('#')) {
    clean = '#' + clean;
  }
  e.theme = clean.toUpperCase();
}

export function getTheme(userId, fallback = '#00A8E1') {
  const entry = store.get(userId);
  if (entry && entry.theme) return entry.theme;
  return fallback;
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of store) {
    if (now - entry.last > TTL_MS) {
      for (const s of Object.values(entry.platforms ?? {})) {
        try { s?.page?.close?.(); } catch (e) { /* ignore */ }
        try { s?.browser?.close?.(); } catch (e) { /* ignore */ }
      }
      store.delete(userId);
      warn('[sessions] reaped ' + userId);
    }
  }
}, 1000 * 60 * 10).unref?.();