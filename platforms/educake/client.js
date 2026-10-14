// language: JavaScript (ESM), file: platforms/educake/client.js
// *Every Educake API call runs inside the logged-in Puppeteer page via page.evaluate(fetch()).
//  Cloudflare's cf_clearance cookie is bound to the browser's TLS fingerprint — raw axios gets 403.*
import crypto from 'node:crypto';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';

function buildPageFetch(attempt) {
  // Runs *inside* the browser context. No closure over Node — must serialize.
  return async ({ url, method, body, headers }) => {
    const init = {
      method,
      credentials: 'include',
      mode: 'cors',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-GB,en;q=0.9',
        'origin': 'https://my.educake.co.uk',
        'referer': `https://my.educake.co.uk${location.pathname}`,
        ...headers,
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, ok: res.ok, text, json };
  };
}

export class EducakeClient {
  constructor(page, session) {
    this.page = page;
    this.session = session; // { jwt, xsrf, attemptId? }
  }

  async call(path, { method = 'GET', body, extraHeaders = {}, retryOn401 = true } = {}) {
    const url = path.startsWith('http') ? path : `${config.educakeBaseUrl}${path}`;
    const headers = {
      'authorization': `Bearer ${this.session.jwt}`,
      'x-xsrf-token': this.session.xsrf,
      'x-correlation-id': crypto.randomUUID(),
      'accept': 'application/json;version=2',
      ...extraHeaders,
    };

    const result = await this.page.evaluate(
      // args pattern: puppeteer serializes fn + args
      async (fetchArgs) => {
        const { url, method, body, headers } = fetchArgs;
        const init = {
          method,
          credentials: 'include',
          mode: 'cors',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-GB,en;q=0.9',
            'origin': 'https://my.educake.co.uk',
            'referer': `https://my.educake.co.uk${location.pathname}`,
            ...headers,
          },
        };
        if (body !== undefined) {
          init.body = JSON.stringify(body);
          init.headers['content-type'] = 'application/json';
        }
        const res = await fetch(url, init);
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
        return { status: res.status, ok: res.ok, text, json };
      },
      { url, method, body, headers },
    );

    if (!result.ok) {
      if (result.status === 401 && retryOn401 && this.session.onAuthFail) {
        warn(`[educake] 401 on ${method} ${path} — attempting re-auth`);
        await this.session.onAuthFail();
        return this.call(path, { method, body, extraHeaders, retryOn401: false });
      }
      const err = new Error(`Educake ${method} ${path} → ${result.status}`);
      err.status = result.status;
      err.body = result.json ?? result.text;
      throw err;
    }
    return result.json;
  }

  async get(path, opts = {})   { return this.call(path, { ...opts, method: 'GET' }); }
  async post(path, body, opts) { return this.call(path, { ...opts, method: 'POST', body }); }
}

void buildPageFetch; // keep linter quiet on unused helper if needed later for non-page transport
