// language: JavaScript (ESM), file: hub/sessionStore.js
// *Namespaced per-user, per-platform session store. In-memory only — Render wipes it on deploy.*
import { warn } from '../utils/logger.js';

const TTL_MS = 1000 * 60 * 60; // 1h idle reap
/** @type {Map<string, { created:number, last:number, platforms:Record<string, any> }>} */
const store = new Map();

function touch(userId) {
  const now = Date.now();
  let entry = store.get(userId);
  if (!entry) { entry = { created: now, last: now, platforms: {} }; store.set(userId, entry); }
  entry.last = now;
  return entry;
}

export function getPlatform(userId, platform) { return store.get(userId)?.platforms?.[platform] ?? null; }
export function setPlatform(userId, platform, value) { touch(userId).platforms[platform] = value; }
export function patchPlatform(userId, platform, patch) {
  const e = touch(userId);
  e.platforms[platform] = { ...(e.platforms[platform] ?? {}), ...patch };
}
export function clearPlatform(userId, platform) { const e = store.get(userId); if (e) delete e.platforms[platform]; }
export function clearUser(userId) { store.delete(userId); }
export function listPlatforms(userId) { return Object.keys(store.get(userId)?.platforms ?? {}); }

setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of store) {
    if (now - entry.last > TTL_MS) { store.delete(userId); warn(`[sessions] reaped ${userId}`); }
  }
}, 1000 * 60 * 10).unref?.();
