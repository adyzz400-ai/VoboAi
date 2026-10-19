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

    // Intercept BOTH /session and /token
    let capturedSessionId = null;
    let capturedJwt = null;

    page.on('response', async (response) => {
      const url = response.url();
      
      // Catch the JWT from /token
      if (url.endsWith('/token')) {
        try {
          const text = await response.text();
          // The /token endpoint usually returns the raw JWT string, or a JSON object with the token.
          if (text.startsWith('eyJ')) {
            capturedJwt = text.trim();
            log('[sparx-login] Captured JWT from /token endpoint');
          } else {
            const json = JSON.parse(text);
            if (json.token) {
              capturedJwt = json.token;
              log('[sparx-login] Captured JWT from /token JSON response');
            }
          }
        } catch (e) {
          log('[sparx-login] Failed to parse /token response: ' + e.message);
        }
      }

      // Catch the session ID from /session
      if (url.endsWith('/session')) {
        try {
          const json = await response.json();
          if (json.sessionID) {
            capturedSessionId = json.sessionID;
            log('[sparx-login] Captured Session ID: ' + capturedSessionId);
          }
        } catch (e) {}
      }
    });

    step('navigating to school select');
    await page.goto('https://selectschool.sparx-learning.com/?app=sparx_maths&forget=1', { waitUntil: 'networkidle2', timeout: 30000 });

    step('searching for school: ' + school);
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

    step('waiting for dashboard redirect');
    await page.waitForFunction(
      () => window.location.href.includes('/student'),
      { timeout: 25000 }
    ).catch(() => log('[sparx-login] Redirect timeout, checking state...'));
    
    // Give the SPA time to make the API calls (/session, /token)
    await new Promise(r => setTimeout(r, 5000));

    step('capturing tokens');
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => c.name + '=' + c.value).join('; ');
    
    if (!capturedJwt) {
      throw new Error('Login failed - could not intercept JWT from /token endpoint.');
    }

    step('login successful');
    return { 
      jwt: capturedJwt, 
      sessionId: capturedSessionId || 'none', 
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
