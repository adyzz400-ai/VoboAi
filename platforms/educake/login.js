// language: JavaScript (ESM), file: platforms/educake/login.js
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';

puppeteerExtra.use(StealthPlugin());

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15';

const USERNAME_SELECTORS = ['input[name="username"]', 'input[type="email"]', 'input[name="email"]', 'input#username'];
const PASSWORD_SELECTORS = ['input[name="password"]', 'input[type="password"]'];

async function firstMatch(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) return el;
  }
  return null;
}

async function dismissCookieBanner(page) {
  const clicked = await page.evaluate(() => {
    const texts = ['Yes, allow all', 'Allow all', 'Allow selection', 'Accept all', 'Accept'];
    const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
    for (const t of texts) {
      const b = buttons.find(el => (el.textContent || '').trim().toLowerCase() === t.toLowerCase());
      if (b) { b.click(); return t; }
    }
    return null;
  });
  if (clicked) {
    log(`[login] dismissed cookie banner via "${clicked}"`);
    await new Promise(r => setTimeout(r, 800));
  } else {
    log('[login] no cookie banner button found (may already be dismissed)');
  }
}

async function clickSubmit(page) {
  const clicked = await page.evaluate(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'))
      .filter(isVisible);
    // prefer buttons with log in / sign in text
    const preferred = candidates.find(el => /log\s*in|sign\s*in/i.test((el.textContent || el.value || '').trim()));
    if (preferred) { preferred.click(); return (preferred.textContent || preferred.value || 'submit').trim(); }
    // fall back to any visible submit-typed control
    const typed = candidates.find(el => el.type === 'submit');
    if (typed) { typed.click(); return 'input[type=submit]'; }
    // fall back to the first visible button on the page
    if (candidates[0]) { candidates[0].click(); return 'first-visible-button'; }
    return null;
  });
  if (!clicked) throw new Error('No clickable submit control found');
  return clicked;
}

async function grabJwtFromPage(page) {
  return page.evaluate(() => {
    const isJwt = (v) => typeof v === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);

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
        } catch {}
      }
      return null;
    };
    const ls = scanStore(localStorage); if (ls) return ls;
    const ss = scanStore(sessionStorage); if (ss) return ss;

    for (const k of Object.keys(window)) {
      try {
        const v = window[k];
        if (isJwt(v)) return { source: `window.${k}`, jwt: v };
        if (v && typeof v === 'object') {
          for (const [sk, sv] of Object.entries(v)) {
            if (isJwt(sv)) return { source: `window.${k}.${sk}`, jwt: sv };
          }
        }
      } catch {}
    }

    for (const m of document.querySelectorAll('meta')) {
      const c = m.getAttribute('content');
      if (isJwt(c)) return { source: `meta:${m.getAttribute('name') || m.getAttribute('property')}`, jwt: c };
    }

    for (const s of document.querySelectorAll('script:not([src])')) {
      const txt = s.textContent || '';
      const match = txt.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
      if (match) return { source: 'inline-script', jwt: match[0] };
    }

    return null;
  });
}

async function waitForJwt(page, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await grabJwtFromPage(page);
    if (found) return found;
    await new Promise(r => setTimeout(r, 400));
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
    await page.setViewport({ width: 1280, height: 900 });
    page.on('console', m => log(`[page ${m.type()}] ${m.text().slice(0, 300)}`));
    page.on('pageerror', e => log(`[pageerror] ${e.message.slice(0, 300)}`));

    step(`navigating to ${config.educakeLoginUrl}`);
    await page.goto(config.educakeLoginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    log(`[login] landed on ${page.url()} · title "${await page.title()}"`);

    step('dismissing cookie banner');
    await dismissCookieBanner(page);

    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => ({
        name: i.name, type: i.type, id: i.id, placeholder: i.placeholder,
      }))
    );
    log(`[login] inputs on page: ${JSON.stringify(inputs)}`);

    step('filling username');
    const u = await firstMatch(page, USERNAME_SELECTORS);
    if (!u) throw new Error(`Username field not found. Inputs seen: ${JSON.stringify(inputs)}`);
    await u.click({ clickCount: 3 });
    await u.type(username, { delay: 30 });

    step('filling password');
    const p = await firstMatch(page, PASSWORD_SELECTORS);
    if (!p) throw new Error('Password field not found.');
    await p.click({ clickCount: 3 });
    await p.type(password, { delay: 30 });

    const urlBefore = page.url();

    step('submitting form');
    const clickedLabel = await clickSubmit(page);
    log(`[login] clicked "${clickedLabel}"`);

    // wait for either navigation OR a page-content change
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }),
        page.waitForFunction(() => !document.querySelector('input[name="password"]'), { timeout: 20_000 }),
      ]);
    } catch {
      log('[login] no navigation detected after 20s');
    }

    await new Promise(r => setTimeout(r, 1500));

    const urlAfter = page.url();
    log(`[login] post-submit url: ${urlAfter} (was ${urlBefore})`);

    const postState = await page.evaluate(() => ({
      title: document.title,
      href: location.href,
      bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 600),
      lsKeys: Object.keys(localStorage),
      ssKeys: Object.keys(sessionStorage),
      stillOnLoginForm: !!document.querySelector('input[name="password"]'),
    }));
    log(`[login] post-submit state: ${JSON.stringify(postState)}`);

    if (postState.stillOnLoginForm) {
      throw new Error(`Login form still present after submit. Page text: ${postState.bodyText}`);
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

    return { browser, page, username, cookies: jar, jwt: found.jwt, xsrf, landingUrl: urlAfter, baseUrl: config.educakeBaseUrl, capturedAt: Date.now() };
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