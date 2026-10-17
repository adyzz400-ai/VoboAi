// language: JavaScript (ESM), file: platforms/educake/client.js
import crypto from 'node:crypto';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';

export class EducakeClient {
  constructor(page, session) {
    this.page = page;
    this.session = session;
  }

  async call(path, opts) {
    opts = opts || {};
    const method = opts.method || 'GET';
    const body = opts.body;
    const retryOn401 = opts.retryOn401 !== false;
    const url = path.startsWith('http') ? path : config.educakeBaseUrl + path;

    const headers = {
      'authorization': 'Bearer ' + this.session.jwt,
      'x-xsrf-token': this.session.xsrf,
      'x-correlation-id': crypto.randomUUID(),
      'accept': 'application/json;version=2',
    };

    log('[client] ' + method + ' ' + path + ' — in-page fetch');

    let result;
    try {
      result = await this.page.evaluate(async (args) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        try {
          const init = {
            method: args.method,
            credentials: 'include',
            mode: 'cors',
            signal: ctrl.signal,
            headers: Object.assign({
              'accept': 'application/json, text/plain, */*',
              'accept-language': 'en-GB,en;q=0.9',
              'origin': 'https://my.educake.co.uk',
              'referer': 'https://my.educake.co.uk' + location.pathname,
            }, args.headers),
          };
          if (args.body !== undefined && args.body !== null) {
            init.body = JSON.stringify(args.body);
            init.headers['content-type'] = 'application/json';
          }
          const res = await fetch(args.url, init);
          const text = await res.text();
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch (e) {}
          return { status: res.status, ok: res.ok, text: text, json: json };
        } catch (err) {
          return { status: 0, ok: false, text: 'evaluate-error: ' + err.message, json: null };
        } finally {
          clearTimeout(timer);
        }
      }, { url, method, body, headers });
    } catch (err) {
      warn('[client] page.evaluate threw: ' + err.message);
      const e = new Error('Educake ' + method + ' ' + path + ' — evaluate failed: ' + err.message);
      e.status = 0;
      throw e;
    }

    log('[client] ' + method + ' ' + path + ' — ' + result.status);

    if (!result.ok) {
      if (result.status === 401 && retryOn401 && typeof this.session.onAuthFail === 'function') {
        warn('[client] 401 — re-auth');
        await this.session.onAuthFail();
        opts.retryOn401 = false;
        return this.call(path, opts);
      }
      const err = new Error('Educake ' + method + ' ' + path + ' → ' + result.status + ' — ' + result.text.slice(0, 200));
      err.status = result.status;
      err.body = result.json ?? result.text;
      throw err;
    }
    return result.json;
  }

  async get(path, opts) {
    const o = Object.assign({}, opts || {}, { method: 'GET' });
    return this.call(path, o);
  }

  async post(path, body, opts) {
    const o = Object.assign({}, opts || {}, { method: 'POST', body: body });
    return this.call(path, o);
  }
}