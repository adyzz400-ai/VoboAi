// language: JavaScript (ESM), file: platforms/educake/auth.js
// *JWT decode + expiry. HS256 payload is base64url; we only read exp — never verify.*
export function decodeJwt(token) {
  try {
    const [, payloadB64] = token.split('.');
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch { return null; }
}

export function jwtExpiryMs(token) {
  const p = decodeJwt(token);
  return p?.exp ? p.exp * 1000 : null;
}

export function jwtSecondsLeft(token) {
  const exp = jwtExpiryMs(token);
  if (!exp) return 0;
  return Math.max(0, Math.floor((exp - Date.now()) / 1000));
}

// Refresh window: refetch at T-2min before exp (refresh lead 120s)
export const REFRESH_LEAD_MS = 120 * 1000;

export function needsRefresh(token) {
  const exp = jwtExpiryMs(token);
  if (!exp) return true;
  return Date.now() >= exp - REFRESH_LEAD_MS;
}
