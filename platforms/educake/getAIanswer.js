// language: JavaScript (ESM), file: platforms/educake/getAIanswer.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { log, warn } from '../../utils/logger.js';
import { config } from '../../utils/config.js';

// EXACT models from your working Python bot
const PRIMARY_MODEL = (process.env.GEMINI_DEFAULT_MODEL || config.geminiDefault || 'gemini-3.5-flash-lite').trim();
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash').split(',').map(m => m.trim());
const MODEL_CHAIN = [PRIMARY_MODEL, ...FALLBACK_MODELS].filter((v, i, a) => a.indexOf(v) === i);

const SYSTEM_RULE = (q) => {
  let prompt = '';
  if (q.kind === 'multiple_choice') {
    prompt = 'Answer the multiple-choice question. Reply with ONLY the exact text of one of the provided choices, verbatim. No explanation, no punctuation, no quotes.\n\nChoices:\n- ' + q.choices.join('\n- ');
  } else if (q.kind === 'number' && q.fields && q.fields.length > 0) {
    const fieldsList = q.fields.map(f => f.label || `Field ${f.ref}`).join('\n- ');
    prompt = 'Answer the math question. Reply with ONLY a valid JSON object where the keys match the field labels and the values are the raw numeric answers (no units like cm, kg, or degrees). Example: {"Question 1": 42, "Question 2": 3.14}. No markdown, no explanation.\n\nFields:\n- ' + fieldsList;
  } else if (q.fields && q.fields.length > 0) {
    const fieldsList = q.fields.map(f => f.label || `Field ${f.ref}`).join('\n- ');
    prompt = 'Answer the question. Reply with ONLY a valid JSON object where the keys match the field labels and the values are the exact text answers. No markdown, no explanation.\n\nFields:\n- ' + fieldsList;
  } else {
    prompt = 'Answer the question. Reply with ONLY the exact final answer. If it is a number, provide ONLY the number (no units like cm or kg). If it is a word, provide ONLY the word. No full sentences, no explanation, no punctuation.';
  }
  if (q.image) {
    prompt += '\n\nCRITICAL: This question has an image. You MUST analyze the image to extract the question text and any visual data (graphs, shapes). Do not guess.';
  }
  return prompt;
};

async function fetchImageAsInline(imageUrl, session) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = res.headers.get('content-type') || 'image/png';
    return { inlineData: { mimeType, data: base64 } };
  } catch (err) {
    warn('[gemini] Failed to fetch image: ' + err.message);
    return null;
  }
}

async function callOnce(model, parts) {
  const rawKey = process.env.GEMINI_API_KEY || config.geminiKey;
  const apiKey = rawKey ? String(rawKey).trim() : null;
  
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing or empty. Check your environment variables.');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });
  
  const contents = [];
  const textParts = [];
  
  for (const part of parts) {
    if (part.inlineData) {
      contents.push({
        role: 'user',
        parts: [{ inlineData: part.inlineData }]
      });
    } else if (part.text) {
      textParts.push(part.text);
    }
  }
  
  if (textParts.length > 0) {
    contents.push({ role: 'user', parts: [{ text: textParts.join('\n') }] });
  }
  
  try {
    const result = await genModel.generateContent({ contents });
    const response = result.response;
    return response.text();
  } catch (err) {
    const status = err.status || err.response?.status || 'unknown';
    const message = err.message || 'Unknown error';
    throw new Error(`Model '${model}' failed with status ${status}: ${message}`);
  }
}

export async function getAIanswer(q, session, opts = {}) {
  const parts = [{ text: SYSTEM_RULE(q) + '\n\nQuestion:\n' + q.prompt }];

  if (q.image) {
    const inline = await fetchImageAsInline(q.image, session);
    if (inline) parts.push(inline);
  }

  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const m = MODEL_CHAIN[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callOnce(m, parts);
        if (!raw || !raw.trim()) continue;
        
        let answer = raw.trim();
        if (answer.startsWith('```json')) {
          answer = answer.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        } else if (answer.startsWith('```')) {
          answer = answer.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        return { answer, model: m };
      } catch (err) {
        warn(`[gemini] ${err.message}`);
      }
    }
  }

  warn('[gemini] ALL models failed.');
  return { answer: null, model: null };
}
