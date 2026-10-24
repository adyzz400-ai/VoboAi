// language: JavaScript (ESM), file: platforms/educake/getAIanswer.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { log, warn } from '../../utils/logger.js';
import { config } from '../../utils/config.js';

// FORCE valid, working Google models. Ignore fake "3.5" or "3.8" names from config.
const PRIMARY_MODEL = 'gemini-1.5-flash';
const FALLBACK_MODELS = ['gemini-1.5-flash-8b', 'gemini-1.5-pro'];

export async function getAIanswer({ kind, prompt, choices, image, fields }, session) {
  const apiKey = (process.env.GEMINI_API_KEY || config.geminiKey || '').trim();
  if (!apiKey) {
    warn('[gemini] API key is missing.');
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Build the prompt based on question type
  let systemPrompt = 'You are a precise UK secondary-school Maths and Science tutor. ';
  if (kind === 'multiple_choice') {
    systemPrompt += `Answer the multiple-choice question. Reply with ONLY the exact text of one of these choices, verbatim. No explanation, no punctuation, no quotes.\nChoices:\n- ${choices.join('\n- ')}\nQuestion:\n${prompt}`;
  } else if (kind === 'number' && fields?.length > 0) {
    const fieldsList = fields.map(f => f.label || `Field ${f.ref}`).join('\n- ');
    systemPrompt += `Answer the math question. Reply with ONLY a valid JSON object where the keys match the field labels and the values are the raw numeric answers (no units like cm, kg, or degrees). Example: {"Question 1": 42, "Question 2": 3.14}. No markdown, no explanation.\nFields:\n- ${fieldsList}\nQuestion:\n${prompt}`;
  } else if (fields?.length > 0) {
    const fieldsList = fields.map(f => f.label || `Field ${f.ref}`).join('\n- ');
    systemPrompt += `Answer the question. Reply with ONLY a valid JSON object where the keys match the field labels and the values are the exact text answers. No markdown, no explanation.\nFields:\n- ${fieldsList}\nQuestion:\n${prompt}`;
  } else {
    systemPrompt += `Answer the question. Reply with ONLY the exact final answer. If it is a number, provide ONLY the number (no units). If it is a word, provide ONLY the word. No full sentences, no explanation, no punctuation.\nQuestion:\n${prompt}`;
  }

  const parts = [{ text: systemPrompt }];
  if (image) {
    parts.push({ inlineData: { mimeType: 'image/png', data: image.toString('base64') } });
  }

  // Try primary model, then fallbacks
  const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  
  for (const model of modelsToTry) {
    try {
      const genModel = genAI.getGenerativeModel({ model });
      const result = await genModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 500,
        }
      });
      
      const rawText = result.response.text().trim();
      if (!rawText) continue;

      // Clean up markdown code blocks if Gemini adds them
      let answer = rawText;
      if (answer.startsWith('```json')) {
        answer = answer.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      } else if (answer.startsWith('```')) {
        answer = answer.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
      }

      log(`[gemini] Successfully answered using ${model}`);
      return { answer, model };
    } catch (err) {
      const status = err.status || err.response?.status || 'unknown';
      const message = err.message || 'Unknown error';
      warn(`[gemini] Model '${model}' failed with status ${status}: ${message}`);
      
      // If it's a 404, the model name is invalid. Skip to next.
      // If it's a 429, we've hit rate limits. Break entirely to prevent account ban.
      if (status === 429) {
        warn('[gemini] Rate limit (429) reached. Stopping AI requests to protect API key.');
        break;
      }
    }
  }

  warn('[gemini] ALL models failed. Returning null.');
  return null;
}
