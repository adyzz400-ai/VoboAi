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

// Based on your key's rate limits, 3.5-flash-lite is the best balance of vision + limits (15 RPM, 500 RPD)
const MODEL_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];

const SYSTEM_RULE = (q) => {
  let prompt = '';
  if (q.kind === 'multiple_choice') {
    prompt = 'Answer the multiple-choice question. Reply with ONLY the exact text of one of the provided choices, verbatim. No explanation, no punctuation around it, no quotes.\n\nChoices:\n- ' + q.choices.join('\n- ');
  } else if (q.kind === 'number') {
    let unitStr = '';
    if (q.unit) {
      unitStr = ' (in ' + q.unit + ')';
    }
    prompt = 'Answer the question. Reply with ONLY the numeric value' + unitStr + '. No units, no explanation, no extra characters.';
  } else {
    prompt = 'Answer the question. Reply with ONLY the shortest exact answer string (a word or short phrase). Do not write full sentences. No explanation, no punctuation around it, no quotes.';
  }

  if (q.image) {
    prompt += '\n\nCRITICAL INSTRUCTION: This question has an image attached. You MUST carefully analyze the image to find the answer. Do not guess.';
  }
  return prompt;
};

async function fetchImageAsInline(url, session) {
  try {
    let absoluteUrl = url;
    if (url.startsWith('/')) {
      absoluteUrl = 'https://my.educake.co.uk' + url;
    }

    const b64 = await session.page.evaluate(async (u) => {
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
      }
      
      const base64String = window.btoa(bin);
      return base64String;
    }, absoluteUrl);

    if (!b64) return null;
    
    let mime = 'image/jpeg';
    if (absoluteUrl.toLowerCase().endsWith('.png')) mime = 'image/png';
    
    return { inlineData: { data: b64, mimeType: mime } };
  } catch (err) {
    return null;
  }
}

async function callOnce(model, parts) {
  const m = client().getGenerativeModel({ model });
  const res = await m.generateContent({ contents: [{ role: 'user', parts: parts }] });
  return (res.response.text() || '').trim();
}

export async function getAIanswer(q, session, opts) {
  const model = (opts && opts.model) ? opts.model : config.geminiDefault;
  const chain = [model, ...MODEL_CHAIN.filter(m => m !== model)];
  
  const parts = [{ text: SYSTEM_RULE(q) + '\n\nQuestion:\n' + q.prompt }];

  if (q.image) {
    const inline = await fetchImageAsInline(q.image, session);
    if (inline) {
      parts.push(inline);
    }
  }

  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callOnce(m, parts);
        const text = raw.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (text) {
          log('[gemini] Success with ' + m + ' -> "' + text + '"');
          return { answer: text, model: m };
        }
      } catch (err) {
        const status = err?.status || err?.response?.status;
        warn('[gemini] ' + m + ' failed (' + (status || '?') + ')');
        
        if (status === 404) break; 
        if (status === 503 || status === 429) { 
          await new Promise(r => setTimeout(r, 15000)); 
          continue; 
        }
        break; 
      }
    }
  }

  warn('[gemini] ALL models failed (rate limited or missing).');
  return { answer: null, model: null };
}
