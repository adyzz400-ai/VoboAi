// language: JavaScript (ESM), file: platforms/educake/login.js
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';

puppeteerExtra.use(StealthPlugin());

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15';

const USERNAME_SELECTORS = ['input[name="username"]', 'input[type="email"]', 'input[name="email"]'];
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
    const texts = ['Yes, allow all', 'Allow all', 'Allow selection', 'Accept all'];
    const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
    for (const t of texts) {
      const b = buttons.find(el => (el.textContent || '').trim().toLowerCase() === t.toLowerCase());
      if (b) { b.click(); return t; }
    }
    return null;
  });
  if (clicked) {
    log('[login] dismissed cookie banner: "' + clicked + '"');
    await new Promise(r => setTimeout(r, 800));
  }
}

async function clickSubmit(page) {
  const clicked = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const cands = Array.from(document.querySelectorAll('button, input[type="submit"]')).filter(visible);
    const preferred = cands.find(el => /log\s*in|sign\s*in/i.test((el.textContent || el.value || '').trim()));
    if (preferred) { preferred.click(); return (preferred.textContent || preferred.value || 'submit').trim(); }
    const typed = cands.find(el => el.type === 'submit');
    if (typed) { typed.click(); return 'input[type=submit]'; }
    if (cands[0]) { cands[0].click(); return 'first-visible'; }
    return null;
  });
  if (!clicked) throw new Error('No clickable submit control found');
  return clicked;
}

export async function educakeLogin(args) {
  const username = args.username;
  const password = args.password;
  const onStatus = args.onStatus || function () {};

  const step = (s) => { log('[login] ' + s); onStatus(s); };

  step('launching browser');
  let browser, page;
  try {
    browser = await puppeteerExtra.launch({
      executablePath: config.chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  } catch (err) {
    log('[login] browser launch FAILED: ' + err.message);
    throw new Error('Browser failed to launch: ' + err.message);
  }

  try {
    page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1280, height: 900 });

    step('navigating to ' + config.educakeLoginUrl);
    await page.goto(config.educakeLoginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    log('[login] landed on ' + page.url());

    step('dismissing cookie banner');
    await dismissCookieBanner(page);

    step('filling username');
    const u = await firstMatch(page, USERNAME_SELECTORS);
    if (!u) throw new Error('Username field not found');
    await u.click({ clickCount: 3 });
    await u.type(username, { delay: 30 });

    step('filling password');
    const p = await firstMatch(page, PASSWORD_SELECTORS);
    if (!p) throw new Error('Password field not found');
    await p.click({ clickCount: 3 });
    await p.type(password, { delay: 30 });

    step('submitting form');
    const label = await clickSubmit(page);
    log('[login] clicked "' + label + '"');

    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25_000 }),
        page.waitForFunction(() => !document.querySelector('input[name="password"]'), { timeout: 25_000 }),
      ]);
    } catch (e) {
      log('[login] no navigation detected after 25s');
    }

    await new Promise(r => setTimeout(r, 2000));

    const urlAfter = page.url();
    log('[login] post-submit url: ' + urlAfter);

    const postState = await page.evaluate(() => ({
      href: location.href,
      stillOnLoginForm: !!document.querySelector('input[name="password"]'),
    }));
    log('[login] post state: ' + JSON.stringify(postState));

    if (postState.stillOnLoginForm) {
      throw new Error('Login form still present — likely wrong credentials');
    }

    step('loading dashboard');
    await page.goto(config.educakeBaseUrl + '/my-educake/', { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null);
    log('[login] dashboard url: ' + page.url());

    step('verifying authenticated session');
    const verify = await page.evaluate(async () => {
      const res = await fetch('https://my.educake.co.uk/api/me', { credentials: 'include' });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) {}
      return { status: res.status, json: json, text: text.slice(0, 200) };
    });
    log('[login] /api/me → ' + verify.status);
    if (verify.status !== 200) {
      throw new Error('Session verify failed: ' + verify.status + ' — ' + verify.text);
    }

    const cookies = await page.cookies();
    const jar = Object.fromEntries(cookies.map(c => [c.name, c.value]));
    const xsrf = jar['XSRF-TOKEN'];
    if (!xsrf) throw new Error('XSRF-TOKEN cookie missing after login.');

    log('[login] success · cookies: ' + Object.keys(jar).join(', '));

    return {
      browser: browser,
      page: page,
      username: username,
      password: password,
      cookies: jar,
      xsrf: xsrf,
      baseUrl: config.educakeBaseUrl,
      capturedAt: Date.now(),
      jwtExpUnix: Math.floor(Date.now() / 1000) + 3600,
    };
  } catch (err) {
    log('[login] FAILED: ' + err.message);
    if (page) { try { await page.close(); } catch (e) {} }
    try { await browser.close(); } catch (e) {}
    throw err;
  }
}