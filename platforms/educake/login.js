// language: JavaScript (ESM), file: platforms/educake/login.js
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';

puppeteerExtra.use(StealthPlugin());

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15';

const USERNAME_SELECTORS = ['input[name="username"]', 'input[type="email"]', 'input[name="email"]', 'input#username'];
const PASSWORD_SELECTORS = ['input[name="password"]', 'input[type="password"]'];
const SUBMIT_SELECTORS   = ['button[type="submit"]', 'input[type="submit"]', 'button.login'];

async function firstMatch(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) return el;
  }
  return null;
}

async function grabJwtFromPage(page) {
  return page.evaluate(() => {
    const isJwt = (v) => typeof v === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);

    // 1. localStorage + sessionStorage
    const scanStore = (store) => {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        const v = store.getItem(k);
        if (isJwt(v)) return { source: `storage:${k}`, jwt: v };
        try {
          const parsed = JSON.parse(v);
          const walk = (o) => {
            if (!o || typeof o !== 'object') return null;
            for (const val of Object.values(o)) {
              if (isJwt(val)) return val;
              const deep = walk(val);
              if (deep) return deep;
            }
            return null;
          };
          const deep = walk(parsed);
          if (deep) return { source: `storage:${k}`, jwt: deep };
        } catch { /* not JSON */ }
      }
      return null;
    };
    const ls = scanStore(localStorage); if (ls) return ls;
    const ss = scanStore(sessionStorage); if (ss) return ss;

    // 2. window globals
    for (const k of Object.keys(window)) {
      try {
        const v = window[k];
        if (isJwt(v)) return { source: `window.${k}`, jwt: v };
        if (v && typeof v === 'object') {
          for (const [sk, sv] of Object.entries(v)) {
            if (isJwt(sv)) return { source: `window.${k}.${sk}`, jwt: sv };
          }
        }
      } catch { /* cross-origin window prop */ }
    }

    // 3. meta tags
    for (const m of document.querySelectorAll('meta')) {
      const c = m.getAttribute('content');
      if (isJwt(c)) return { source: `meta:${m.getAttribute('name') || m.getAttribute('property')}`, jwt: c };
    }

    // 4. script tag contents
    for (const s of document.querySelectorAll('script:not([src])')) {
      const txt = s.textContent || '';
      const match = txt.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
      if (match) return { source: 'inline-script', jwt: match[0] };
    }

    return null;
  });
}

async function waitForJwt(page, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await grabJwtFromPage(page);
    if (found) return found;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

export async function educakeLogin({ username, password, onStatus = () => {} }) {
  const step = (s) => { log(`[login] ${s}`); onStatus(s); };

  step('launching browser');
  let browser, page;
  try {
    browser = await puppeteerExtra.launch({
      executablePath: config.chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  } catch (err) {
    log(`[login] browser launch FAILED: ${err.message}`);
    throw new Error(`Browser failed to launch: ${err.message}`);
  }

  try {
    page = await browser.newPage();
    await page.setUserAgent(UA);
    page.on('console', m => log(`[page ${m.type()}] ${m.text()}`));
    page.on('pageerror', e => log(`[pageerror] ${e.message}`));

    step(`navigating to ${config.educakeLoginUrl}`);
    await page.goto(config.educakeLoginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    log(`[login] landed on ${page.url()} · title "${await page.title()}"`);

    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => ({
        name: i.name, type: i.type, id: i.id, placeholder: i.placeholder,
      }))
    );
    log(`[login] inputs on page: ${JSON.stringify(inputs)}`);

    step('filling username');
    const u = await firstMatch(page, USERNAME_SELECTORS);
    if (!u) throw new Error(`Username field not found. Inputs seen: ${JSON.stringify(inputs)}`);
    await u.type(username, { delay: 25 });

    step('filling password');
    const p = await firstMatch(page, PASSWORD_SELECTORS);
    if (!p) throw new Error('Password field not found.');
    await p.type(password, { delay: 25 });

    step('submitting form');
    const s = await firstMatch(page, SUBMIT_SELECTORS);
    if (!s) {
      const buttons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, input[type="submit"]')).map(b => ({
          text: b.textContent?.trim(), type: b.type, cls: b.className,
        }))
      );
      throw new Error(`Submit not found. Buttons seen: ${JSON.stringify(buttons)}`);
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null),
      s.click(),
    ]);

    const url = page.url();
    log(`[login] post-submit url: ${url}`);

    // dump what's actually on the page after submit
    const postState = await page.evaluate(() => ({
      title: document.title,
      href: location.href,
      bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
      lsKeys: Object.keys(localStorage),
      ssKeys: Object.keys(sessionStorage),
      hasJwtInAnyStore: (() => {
        const isJwt = (v) => typeof v === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
        for (const store of [localStorage, sessionStorage]) {
          for (let i = 0; i < store.length; i++) {
            const v = store.getItem(store.key(i));
            if (isJwt(v)) return true;
            try { if (JSON.stringify(JSON.parse(v)).includes('eyJ')) return true; } catch {}
          }
        }
        return false;
      })(),
    }));
    log(`[login] post-submit state: ${JSON.stringify(postState)}`);

    if (/student-login|\/login/i.test(url) && !/my-educake|student/i.test(url)) {
      throw new Error(`Login rejected - still on the login page. Body: ${postState.bodyText}`);
    }

    step('loading dashboard');
    await page.goto(`${config.educakeBaseUrl}/my-educake/`, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null);
    log(`[login] dashboard url: ${page.url()}`);

    step('extracting session token');
    const found = await waitForJwt(page);
    if (found) log(`[login] JWT found in ${found.source}`);
    else {
      const dump = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        lsKeys: Object.keys(localStorage),
        ssKeys: Object.keys(sessionStorage),
        cookieNames: document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(Boolean),
      }));
      log(`[login] JWT NOT FOUND · page dump: ${JSON.stringify(dump)}`);
      throw new Error('Bearer JWT not found in page storage after login.');
    }

    const cookies = await page.cookies();
    const jar = Object.fromEntries(cookies.map(c => [c.name, c.value]));
    const xsrf = jar['XSRF-TOKEN'];
    if (!xsrf) throw new Error('XSRF-TOKEN cookie missing after login.');

    log(`[login] success · cookies: ${Object.keys(jar).join(', ')}`);

    return { browser, page, username, cookies: jar, jwt: found.jwt, xsrf, landingUrl: url, baseUrl: config.educakeBaseUrl, capturedAt: Date.now() };
  } catch (err) {
    log(`[login] FAILED at step: ${err.message}`);
    if (page) { try { await page.close(); } catch {} }
    try { await browser.close(); } catch {}
    throw err;
  }
}

export async function refreshEducakeSession(session) {
  warn('[educake] refreshing session');
  try { await session.page?.close(); } catch {}
  try { await session.browser?.close(); } catch {}
  return educakeLogin({ username: session.username, password: session.password });
}