// language: JavaScript (ESM), file: utils/formatTime.js
export function humanDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}
export const relativeTag = (unixSeconds) => `<t:${Math.floor(unixSeconds)}:R>`;
export const fullTag = (unixSeconds) => `<t:${Math.floor(unixSeconds)}:f>`;
export const nowUnix = () => Math.floor(Date.now() / 1000);
export const dateOnlyToUnix = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59Z`);
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
};
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
