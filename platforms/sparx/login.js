// language: JavaScript (ESM), file: platforms/sparx/login.js
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';
import { log } from '../../utils/logger.js';

puppeteerExtra.use(StealthPlugin());

export async function sparxLogin({ school, username, password, onStatus }) {
  const step = (s) => { log('[sparx-login] ' + s); onStatus(s); };

  step('launching browser');
  let browser, page;
  try {
    // Launch using the bundled Chromium binary (bypasses host postinstall blocks)
    browser = await puppeteerExtra.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    step('navigating');
    await page.goto('https://selectschool.sparx-learning.com/?app=sparx_maths&forget=1', { waitUntil: 'networkidle2', timeout: 30000 });

    step('searching school');
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.click('input[type="text"]');
    await page.type('input[type="text"]', school, { delay: 50 });
    
    await new Promise(r => setTimeout(r, 2000));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.toLowerCase().includes('continue'));
      if (btn) btn.click();
    });

    step('waiting login form');
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

    step('waiting redirect');
    await page.waitForFunction(
      () => window.location.href.includes('/student'),
      { timeout: 25000 }
    ).catch(() => log('[sparx-login] Redirect timeout'));
    
    await new Promise(r => setTimeout(r, 3000));

    step('manually fetching tokens via browser session');
    const authData = await page.evaluate(async () => {
      try {
        const tokenRes = await fetch('https://api.sparx-learning.com/token', { credentials: 'include' });
        const tokenText = await tokenRes.text();
        
        const sessionRes = await fetch('https://api.sparx-learning.com/session', { credentials: 'include' });
        const sessionJson = await sessionRes.json();

        return {
          tokenText,
          sessionId: sessionJson.sessionID || null
        };
      } catch (e) {
        return { error: e.message };
      }
    });

    if (authData.error) {
      throw new Error('Failed to fetch tokens: ' + authData.error);
    }

    let jwt = authData.tokenText;
    if (jwt.startsWith('bearer ')) jwt = jwt.replace('bearer ', '').trim();

    if (!jwt || !jwt.startsWith('eyJ')) {
      throw new Error('Login failed - Token endpoint returned invalid data: ' + jwt.slice(0, 20));
    }

    log('[sparx-login] Successfully fetched JWT and Session ID');

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => c.name + '=' + c.value).join('; ');

    step('login successful');
    return { 
      jwt: jwt, 
      sessionId: authData.sessionId || 'none', 
      cookie: cookieString, 
      school, 
      username,
      browser: browser,
      page: page
    };

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw err;
  }
}