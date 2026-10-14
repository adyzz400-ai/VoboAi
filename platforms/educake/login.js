// language: JavaScript (ESM), file: platforms/educake/login.js
// *Headless login to my.educake.co.uk. Returns a live Puppeteer page + JWT + XSRF + cookies,
//  kept open so every subsequent API call rides the same TLS fingerprint (cf_clearance).*
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';

puppeteerExtra.use(StealthPlugin());

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
           '(KHTML, like Gecko) Version/26.6 Safari/605.1.15';

const USERNAME_SELECTORS = [
  'input[name="username"]', 'input[type="email"]', 'input[name="email"]', 'input#username',
];
const PASSWORD_SELECTORS = ['input[name="password"]', 'input[type="password"]'];
const SUBMIT_SELECTORS   = ['button[type="submit"]', 'input[type="submit"]', 'button.login'];

async function firstMatch(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) return el;
  }
  return null;
}

// Grab the Bearer JWT out of wherever the app stashes it after login.
// Educake sets it after the SPA boots; we poll localStorage / sessionStorage for a JWT-shaped string.
async function grabJwtFromPage(page) {
  const found = await page.evaluate(() => {
    const isJwt = (v) => typeof v === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
    const scan = (store) => {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        const v = store.getItem(k);
        if (isJwt(v)) return v;
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
          if (deep) return deep;
        } catch { /* not JSON */ }
      }
      return null;
    };
    return scan(localStorage) || scan(sessionStorage);
  });
  return found;
}

async function waitForJwt(page, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const jwt = await grabJwtFromPage(page);
    if (jwt) return jwt;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

export async function educakeLogin({ username, password }) {
  const browser = await puppeteerExtra.launch({
    executablePath: config.chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(config.educakeLoginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const u = await firstMatch(page, USERNAME_SELECTORS);
    if (!u) throw new Error('Username field not found — page layout changed.');
    await u.type(username, { delay: 25 });

    const p = await firstMatch(page, PASSWORD_SELECTORS);
    if (!p) throw new Error('Password field not found.');
    await p.type(password, { delay: 25 });

    const s = await firstMatch(page, SUBMIT_SELECTORS);
    if (!s) throw new Error('Submit button not found.');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null),
      s.click(),
    ]);

    const url = page.url();
    if (/student-login|\/login/i.test(url) && !/my-educake|student/i.test(url)) {
      throw new Error('Login rejected — still on the login page.');
    }

    // The SPA needs a beat to stash the JWT once /my-educake/ renders.
    await page.goto(`${config.educakeBaseUrl}/my-educake/`, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null);
    const jwt = await waitForJwt(page);
    if (!jwt) throw new Error('Bearer JWT not found in page storage after login.');

    const cookies = await page.cookies();
    const jar = Object.fromEntries(cookies.map(c => [c.name, c.value]));
    const xsrf = jar['XSRF-TOKEN'];
    if (!xsrf) throw new Error('XSRF-TOKEN cookie missing after login.');

    log(`[educake] login ok · jwt exp in ${Math.floor(((JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8')).exp * 1000) - Date.now())/1000)}s · cookies: ${Object.keys(jar).join(', ')}`);

    return {
      browser, page,
      username,
      cookies: jar,
      jwt,
      xsrf,
      landingUrl: url,
      baseUrl: config.educakeBaseUrl,
      capturedAt: Date.now(),
    };
  } catch (err) {
    // if we threw, the browser must die
    if (page) await page.close().catch(() => {});
    await browser.close().catch(() => {});
    throw err;
  }
}

// Refresh = close the old page/browser, do the login dance again with cached creds.
export async function refreshEducakeSession(session) {
  warn('[educake] refreshing session');
  try { await session.page?.close(); } catch { /* ignore */ }
  try { await session.browser?.close(); } catch { /* ignore */ }
  const fresh = await educakeLogin({ username: session.username, password: session.password });
  return fresh;
}
