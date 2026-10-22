// language: JavaScript (ESM), file: platforms/educake/getAIanswer.js
// *Structured field support, JSON enforcement, unit stripping, markdown cleanup*
// *KEEP your existing callOnce() and fetchImageAsInline() implementations — do not overwrite them*

import { log, warn } from '../../utils/logger.js';
import { config } from '../../utils/config.js';

const MODEL_CHAIN = config.aiModels || ['gemini-2.5-flash', 'gpt-4o', 'claude-sonnet-4'];

const SYSTEM_RULE = (q) => {
  let prompt = '';

  if (q.kind === 'multiple_choice') {
    prompt = 'Answer the multiple-choice question. Reply with ONLY the exact text of one of the provided choices, verbatim. Do not include units if they are not in the choice text. No explanation, no punctuation, no quotes.\n\nChoices:\n- ' + q.choices.join('\n- ');
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

export async function getAIanswer(q, session, opts = {}) {
  const model = opts.model || config.geminiDefault || MODEL_CHAIN[0];
  const chain = [model, ...MODEL_CHAIN.filter(m => m !== model)];

  const parts = [{ text: SYSTEM_RULE(q) + '\n\nQuestion:\n' + q.prompt }];

  if (q.image) {
    const inline = await fetchImageAsInline(q.image, session);
    if (inline) parts.push(inline);
  }

  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callOnce(m, parts);
        const text = raw.replace(/^["'`]+|["'`]+$/g, '').replace(/^```json\s*|\s*```$/g, '').trim();

        if (!text) continue;

        if (q.fields && q.fields.length > 0) {
          try {
            const parsed = JSON.parse(text);
            const answers = {};
            q.fields.forEach((f, idx) => {
              const key = f.label || `field_${idx}`;
              answers[f.ref] = String(parsed[key] || parsed[f.label] || text).trim();
            });
            log(`[gemini] Success with ${m} -> structured fields`);
            return { answers, model: m };
          } catch (e) {
            const answers = {};
            q.fields.forEach(f => { answers[f.ref] = text; });
            log(`[gemini] Success with ${m} -> mapped plain text to fields`);
            return { answers, model: m };
          }
        }

        if (text) {
          log(`[gemini] Success with ${m} -> "${text}"`);
          return { answer: text, model: m };
        }
      } catch (err) {
        const status = err?.status || err?.response?.status;
        warn(`[gemini] ${m} failed (${status || '?'})`);
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
