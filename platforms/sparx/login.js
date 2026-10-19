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

    step('navigating to school select');
    // Direct navigation to the school selector
    await page.goto('https://selectschool.sparx-learning.com/?app=sparx_maths&forget=1', { waitUntil: 'networkidle2', timeout: 30000 });

    step('searching for school: ' + school);
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.click('input[type="text"]');
    await page.type('input[type="text"]', school, { delay: 50 });
    
    // Wait for the dropdown to populate and hit Enter
    await new Promise(r => setTimeout(r, 2000));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    
    // Click Continue
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.toLowerCase().includes('continue'));
      if (btn) btn.click();
    });

    step('waiting for login form');
    await page.waitForSelector('input[name="username"]', { visible: true, timeout: 20000 });
    
    step('entering credentials');
    await page.type('input[name="username"]', username, { delay: 50 });
    await page.type('input[name="password"]', password, { delay: 50 });

    step('submitting login');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'log in');
      if (btn) btn.click();
      else document.querySelector('input[type="submit"]')?.click();
    });

    // Wait for the dashboard URL
    step('waiting for dashboard redirect');
    await page.waitForFunction(
      () => window.location.href.includes('/student'),
      { timeout: 25000 }
    ).catch(() => log('[sparx-login] Redirect timeout, checking state...'));
    
    // Give the SPA time to set cookies and storage
    await new Promise(r => setTimeout(r, 5000));

    step('capturing tokens');
    const tokens = await page.evaluate(() => {
      const findToken = () => {
        const isJwt = v => typeof v === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
        for (const store of [localStorage, sessionStorage]) {
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
            } catch (e) {}
          }
        }
        return null;
      };
      return {
        jwt: findToken(),
        url: window.location.href,
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage)
      };
    });

    log('[sparx-login] URL: ' + tokens.url);
    log('[sparx-login] Storage keys: ' + JSON.stringify(tokens.localStorageKeys) + ' ' + JSON.stringify(tokens.sessionStorageKeys));

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => c.name + '=' + c.value).join('; ');
    const sessionCookie = cookies.find(c => c.name === 'spxlrn_session');

    if (!tokens.jwt && !sessionCookie) {
      throw new Error('Login failed - no JWT or session cookie found.');
    }

    if (tokens.jwt) {
      log('[sparx-login] JWT extracted from storage.');
    } else {
      log('[sparx-login] Using session cookie for auth.');
    }

    step('login successful');
    return { 
      jwt: tokens.jwt || 'cookie-only-session', 
      sessionId: 'cookie-only-session', 
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
