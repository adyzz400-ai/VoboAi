// language: JavaScript (ESM), file: platforms/educake/getAIanswer.js
// *One call to Gemini per question. Text-first; image URL is passed through if present.*
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { config } from '../../utils/config.js';
import { log } from '../../utils/logger.js';

let genAI = null;
function client() {
  if (!genAI) {
    if (!config.geminiKey) throw new Error('GEMINI_API_KEY missing');
    genAI = new GoogleGenerativeAI(config.geminiKey);
  }
  return genAI;
}

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
  // Same-origin images need the browser's cookies; call from inside the page.
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

export async function getAIanswer(q, session, { model = config.geminiDefault } = {}) {
  const m = client().getGenerativeModel({ model });
  const parts = [{ text: `${SYSTEM_RULE(q)}\n\nQuestion:\n${q.prompt}` }];

  if (q.image) {
    const inline = await fetchImageAsInline(q.image, session);
    if (inline) parts.push(inline);
  }

  const res = await m.generateContent({ contents: [{ role: 'user', parts }] });
  const text = res.response.text()?.trim() ?? '';

  // strip a wrapping pair of quotes if the model added any
  return text.replace(/^["'`]+|["'`]+$/g, '').trim();
}

void axios; // reserved for future non-page transport
