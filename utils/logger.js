// language: JavaScript (ESM), file: utils/logger.js
// *Timestamped console logger. Redacts JWTs and cookie jars so nothing sensitive lands in logs.*
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const COOKIE_HEAD_RE = /(PHPSESSID|XSRF-TOKEN|cf_clearance)=([^;\s]+)/gi;

export function redact(v) {
  if (v == null) return v;
  if (typeof v === 'string') return v.replace(JWT_RE, 'eyJ…[jwt]').replace(COOKIE_HEAD_RE, '$1=[redacted]');
  if (Array.isArray(v)) return v.map(redact);
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (/^(authorization|password|jwt|token|csrf|cookies?)$/i.test(k)) out[k] = '[redacted]';
      else out[k] = redact(val);
    }
    return out;
  }
  return v;
}

const fmt = (a) => a.map(x => (typeof x === 'string' ? x : JSON.stringify(redact(x)))).join(' ');

export const log = (...a) => console.log(`[${ts()}]`, fmt(a));
export const warn = (...a) => console.warn(`[${ts()}] WARN`, fmt(a));
export const error = (...a) => console.error(`[${ts()}] ERR `, fmt(a));