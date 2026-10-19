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
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--disable-software-rasterizer'
      ],
    });
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    step('navigating to sparx');
    await page.goto('https://maths.sparx-learning.com/', { waitUntil: 'networkidle2', timeout: 30000 });

    step('searching for school: ' + school);
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.click('input[type="text"]');
    await page.type('input[type="text"]', school, { delay: 50 });
    
    // Wait for the dropdown to populate
    await new Promise(r => setTimeout(r, 2500));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.toLowerCase().includes('continue'));
      if (btn) btn.click();
    });

    step('waiting for login form');
    await page.waitForSelector('input[name="username"]', { visible: true, timeout: 15000 }).catch(async () => {
      await page.waitForSelector('input[id="username"]', { visible: true, timeout: 5000 });
    });
    
    step('entering credentials');
    const uSel = await page.$('input[name="username"]') ? 'input[name="username"]' : 'input[id="username"]';
    const pSel = await page.$('input[name="password"]') ? 'input[name="password"]' : 'input[id="password"]';
    
    await page.click(uSel, { clickCount: 3 });
    await page.type(uSel, username, { delay: 50 });
    await page.click(pSel, { clickCount: 3 });
    await page.type(pSel, password, { delay: 50 });

    step('submitting login');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
      page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'log in');
        if (btn) btn.click();
        else document.querySelector('input[type="submit"]')?.click();
      })
    ]);

    const urlAfter = page.url();
    if (urlAfter.includes('login') || urlAfter.includes('select-school')) {
      throw new Error('Login failed - still on login/select page.');
    }

    step('capturing tokens');
    const tokens = await page.evaluate(() => {
      const findToken = () => {
        const isJwt = v => typeof v === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
        for (const s of [localStorage, sessionStorage]) {
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            const v = s.getItem(k);
            if (isJwt(v)) return v;
          }
        }
        return null;
      };
      return {
        jwt: findToken(),
        sessionId: localStorage.getItem('session_id') || sessionStorage.getItem('session_id') || null
      };
    });

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => c.name + '=' + c.value).join('; ');
    
    if (!tokens.jwt) throw new Error('JWT not found in storage after login.');

    step('login successful');
    return { jwt: tokens.jwt, sessionId: tokens.sessionId, cookie: cookieString, school, username };

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      log('[sparx-login] Browser closed to free memory.');
    }
  }
}
