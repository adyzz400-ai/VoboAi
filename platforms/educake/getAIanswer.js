// language: JavaScript (ESM), file: platforms/educake/getAIanswer.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';

let genAI = null;
function client() {
  if (!genAI) {
    if (!config.geminiKey) throw new Error('GEMINI_API_KEY missing');
    genAI = new GoogleGenerativeAI(config.geminiKey);
  }
  return genAI;
}

// Primary model + fallbacks, tried in order on overload.
const MODEL_CHAIN = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];

const SYSTEM_RULE = (q) => {
  if (q.kind === 'multiple_choice') {
    return `Answer the multiple-choice question. Reply with ONLY the exact text of one of the provided choices, verbatim. No explanation, no punctuation around it, no quotes.\n\nChoices:\n- ${q.choices.join('\n- ')}`;
  }
  if (q.kind === 'number') {
    return `Answer the question. Reply with ONLY the numeric value${q.unit ? ` (in ${q.unit})` : ''}. No units, no explanation, no extra characters.`;
  }
  return `Answer the question. Reply with ONLY the shortest exact answer string (a word or short phrase). No explanation, no punctuation around it, no quotes.`;
};

async function fetchImageAsInline(url, session) {
  try {
    const b64 = await session.page.evaluate(async (u) => {
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }, url);
    if (!b64) return null;
    const mime = url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    return { inlineData: { data: b64, mimeType: mime } };
  } catch (err) {
    log(`[gemini] image fetch failed for ${url}: ${err.message}`);
    return null;
  }
}

async function callOnce(model, parts) {
  const m = client().getGenerativeModel({ model });
  const res = await m.generateContent({ contents: [{ role: 'user', parts }] });
  return (res.response.text() ?? '').trim();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function getAIanswer(q, session, { model = config.geminiDefault } = {}) {
  const chain = [model, ...MODEL_CHAIN.filter(m => m !== model)];
  const parts = [{ text: `${SYSTEM_RULE(q)}\n\nQuestion:\n${q.prompt}` }];

  if (q.image) {
    const inline = await fetchImageAsInline(q.image, session);
    if (inline) parts.push(inline);
  }

  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callOnce(m, parts);
        const text = raw.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (text) return { answer: text, model: m };
      } catch (err) {
        const status = err?.status ?? err?.response?.status;
        const is503 = /503|overload|high demand/i.test(err.message || '');
        warn(`[gemini] ${m} attempt ${attempt + 1} failed (${status ?? '?'}): ${err.message.slice(0, 120)}`);
        if (is503 || status === 429) { await sleep(600 * (attempt + 1)); continue; }
        break; // non-retryable for this model — move to next in chain
      }
    }
  }

  warn('[gemini] all models failed — returning null answer');
  return { answer: null, model: null };
}