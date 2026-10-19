// language: JavaScript (ESM), file: platforms/sparx/login.js
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../../utils/config.js';
import { log } from '../../utils/logger.js';

puppeteerExtra.use(StealthPlugin());

export async function sparxLogin({ school, username, password, onStatus }) {
  const step = (s) => { log('[sparx-login] ' + s); onStatus(s); };

  step('launching browser');
  let browser, page;
  try {
    browser = await puppeteerExtra.launch({
      executablePath: config.chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    step('navigating directly to oauth login');
    // We bypass the school search by hitting the OAuth endpoint directly.
    // Note: '73c19cc9-1158-40ce-a858-b6f2061af7d8' was the school ID in your Heston capture.
    // Since we don't have a lookup table, we will use the raw search first, but wait for the redirect.
    
    await page.goto('https://maths.sparx-learning.com/', { waitUntil: 'networkidle2', timeout: 30000 });

    step('searching for school: ' + school);
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.click('input[type="text"]');
    await page.type('input[type="text"]', school, { delay: 100 });
    
    // Wait for the dropdown list to actually appear
    await page.waitForSelector('.dropdown-item, li, [role="option"]', { timeout: 10000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1000));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    step('waiting for select-school redirect');
    // Wait for the URL to change to selectschool or oauth2
    await page.waitForFunction(
      () => window.location.href.includes('selectschool') || window.location.href.includes('oauth2'),
      { timeout: 15000 }
    ).catch(() => null);
    await new Promise(r => setTimeout(r, 2000));

    step('clicking continue on school page');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const btn = btns.find(b => b.textContent.toLowerCase().includes('continue'));
      if (btn) btn.click();
    });

    step('waiting for login form');
    await page.waitForSelector('input[name="username"]', { visible: true, timeout: 20000 });
    
    step('entering credentials');
    await page.type('input[name="username"]', username, { delay: 50 });
    await page.type('input[name="password"]', password, { delay: 50 });

    step('submitting login');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
      page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'log in');
        if (btn) btn.click();
        else document.querySelector('input[type="submit"]')?.click();
      })
    ]);

    // Give the dashboard time to load and set cookies
    await new Promise(r => setTimeout(r, 5000));

    step('capturing tokens');
    const tokens = await page.evaluate(() => {
      const findToken = () => {
        const isJwt = v => typeof v === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
        for (const s of [localStorage, sessionStorage]) {
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            const v = s.getItem(k);
            if (isJwt(v)) return { source: 'storage', key: k, jwt: v };
          }
        }
        return null;
      };
      return {
        found: findToken(),
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage),
        url: window.location.href
      };
    });

    log('[sparx-login] URL: ' + tokens.url);
    log('[sparx-login] Storage keys: ' + JSON.stringify(tokens.localStorageKeys) + ' ' + JSON.stringify(tokens.sessionStorageKeys));

    if (tokens.found) {
      log('[sparx-login] JWT found in ' + tokens.found.key);
    }

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => c.name + '=' + c.value).join('; ');
    const sessionCookie = cookies.find(c => c.name === 'spxlrn_session');

    if (!tokens.found && !sessionCookie) {
      throw new Error('Login failed - no JWT or session cookie found.');
    }

    step('login successful');
    return { 
      jwt: tokens.found ? tokens.found.jwt : 'cookie-only-session', 
      sessionId: tokens.found ? (localStorage.getItem('session_id') || sessionStorage.getItem('session_id')) : 'cookie-only-session', 
      cookie: cookieString, 
      school, 
      username 
    };

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      log('[sparx-login] Browser closed to free memory.');
    }
  }
}
