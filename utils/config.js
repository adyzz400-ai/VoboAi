// language: JavaScript (ESM), file: utils/config.js
// *Reads config.json, overrides any field from process.env. Locally: fill JSON.
//  On Render: leave JSON nulls, set env vars in the dashboard.*
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));
const pick = (envKey, fallback) => process.env[envKey] ?? fallback;

export const config = {
  accent: raw.accent,
  geminiDefault: pick('GEMINI_DEFAULT_MODEL', raw.geminiDefault),
  waits: raw.waits,
  educakeLoginUrl: raw.educakeLoginUrl,
  educakeBaseUrl: raw.educakeBaseUrl,
  discordToken: pick('DISCORD_TOKEN', raw.discordToken),
  geminiKey: pick('GEMINI_API_KEY', raw.geminiKey),
  supabaseUrl: pick('SUPABASE_URL', raw.supabaseUrl),
  supabaseKey: pick('SUPABASE_SERVICE_KEY', raw.supabaseKey),
  chromePath: pick('CHROME_PATH', undefined),
  queueConcurrency: Number(pick('QUEUE_CONCURRENCY', '1')),
};

if (!config.discordToken) { console.error('[config] DISCORD_TOKEN missing — refusing to boot.'); process.exit(1); }
