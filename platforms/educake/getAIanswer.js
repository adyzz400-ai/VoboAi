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

const MODEL_CHAIN = [
  'gemini-3.8-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

const SYSTEM_RULE = (q) => {
  let prompt = '';
  if (q.kind === 'multiple_choice') {
    prompt = `Answer the multiple-choice question. Reply with ONLY the exact text of one of the provided choices, verbatim. No explanation, no punctuation around it, no quotes.\n\nChoices:\n- ${q.choices.join('\n- ')}`;
  } else if (q.kind === 'number') {
    prompt = `Answer the question. Reply with ONLY the numeric value${q.unit ? ` (in ${q.unit})` : ''}. No units, no explanation, no extra characters.`;
  } else {
    prompt = `Answer the question. Reply with ONLY the shortest exact answer string (a word or short phrase). Do not write full sentences. No explanation, no punctuation around it, no quotes.`;
  }

  if (q.image) {
    prompt += `\n\nCRITICAL INSTRUCTION: This question has an image attached. You MUST carefully analyze the image to find the answer. Do not guess.`;
  }
  return prompt;
};

async function fetchImageAsInline(url, session) {
  try {
    log(`[gemini] Fetching image: ${url}`);
    
    // Convert relative URL to absolute if needed
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
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }, absoluteUrl);

    if (!b64) {
      warn(`[gemini] Failed to fetch image data: ${absoluteUrl}`);
      return null;
    }
    
    let mime = 'image/jpeg';
    if (absoluteUrl.toLowerCase().endsWith('.png')) mime = 'image/png';
    
    // If it's an SVG, we can't send it as inline image data directly to Gemini.
    // We'll convert it to a data URI string and pass it as text if needed, 
    // but for now, we'll label it as png if we have to, though it might fail.
    if (absoluteUrl.toLowerCase().endsWith('.svg')) {
        log(`[gemini] SVG detected. Gemini inlineData doesn't support SVG well.`);
        // Note: Ideally we would use a canvas library to convert SVG to PNG here.
    }

    log(`[gemini] Image successfully fetched and attached (${mime}).`);
    return { inlineData: { data: b64, mimeType: mime } };
  } catch (err) {
    warn(`[gemini] image fetch failed for ${url}: ${err.message}`);
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
    if (inline) {
      parts.push(inline);
    } else {
      warn('[gemini] Proceeding without image because fetch failed.');
    }
  }

  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callOnce(m, parts);
        const text = raw.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (text) {
          log(`[gemini] Success with model: ${m} -> "${text}"`);
          return { answer: text, model: m };
        }
      } catch (err) {
        const status = err?.status ?? err?.response?.status;
        warn(`[gemini] ${m} attempt ${attempt + 1} failed (${status ?? '?'}): ${err.message.slice(0, 120)}`);
        if (status === 404) break; 
        if (status === 503 || status === 429) { 
          await sleep(1000 * (attempt + 1)); 
          continue; 
        }
        break; 
      }
    }
  }

  warn('[gemini] all models failed — returning null answer');
  return { answer: null, model: null };
}
