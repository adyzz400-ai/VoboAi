// language: JavaScript (ESM), file: platforms/sparx/autocompleter.js
import { log, warn } from '../../utils/logger.js';
import { getAIanswer } from '../educake/getAIanswer.js';
import { SparxClient } from './client.js';
import { parseSparxQuestion } from './parser.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay(minMs, maxMs, isFirst) {
  if (isFirst) return minMs; 
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function validateAnswer(ai, parsed) {
  if (!ai) return { valid: false, reason: 'no AI response' };
  if (parsed.type === 'multiple' || parsed.type === 'slot') {
    const choices = parsed.choices.map(c => c.text.trim().toLowerCase());
    const answer = (ai.answer || '').trim().toLowerCase();
    if (!answer) return { valid: false, reason: 'empty answer' };
    const match = choices.some(c => c === answer || c.includes(answer) || answer.includes(c));
    if (!match) {
      const fuzzy = choices.find(c => c.includes(answer.slice(0, 5)) || answer.includes(c.slice(0, 5)));
      if (fuzzy) return { valid: true, answer: fuzzy, original: ai.answer };
      return { valid: false, reason: `answer "${ai.answer}" not in choices` };
    }
    return { valid: true, answer: ai.answer };
  }
  if (parsed.type === 'number' || parsed.type === 'text') {
    if (!ai.answers || Object.keys(ai.answers).length === 0) return { valid: false, reason: 'no structured answers returned' };
    return { valid: true, answers: ai.answers };
  }
  return { valid: true, answer: ai.answer };
}

async function retryWithElimination({ parsed, session, eliminatedChoices }) {
  const remaining = parsed.choices.filter(c => !eliminatedChoices.includes(c.text));
  if (remaining.length === 0) return null;
  const ai = await getAIanswer({ kind: 'multiple_choice', prompt: parsed.prompt, choices: remaining.map(c => c.text), image: parsed.image, fields: parsed.numberFields || parsed.textFields }, session);
  if (!ai || !ai.answer) return null;
  const chosen = remaining.find(c => c.text.trim().toLowerCase() === ai.answer.trim().toLowerCase()) || remaining[0];
  return { chosen, ai };
}

export async function runSparxPackage({ session, packageId, homework, interaction, signal, onLog }) {
  const client = new SparxClient(session);
  const minMs = session.waits?.min || 8;
  const maxMs = session.waits?.max || 15;
  
  let totalCorrect = 0;
  let questionsCompleted = 0;
  const failedTasks = [];

  try {
    for (let i = 0; i < homework.tasks.length; i++) {
      if (signal.cancelled) break;
      const task = homework.tasks[i];
      onLog(`Starting Task: ${task.title}`);
      
      let item = 1;
      let buffer = await client.getActivity(packageId, task.taskId, item);
      let taskCorrect = 0;

      while (!signal.cancelled && item <= task.total) {
        let parsed;
        try { 
          parsed = parseSparxQuestion(buffer); 
        } catch (err) { 
          warn('[sparx] parse failed on item ' + item + ': ' + err.message); 
          break; 
        }

        // CRITICAL SAFETY CHECK: Prevent "invalid name" gRPC errors
        if (!parsed.activityId || parsed.activityId.length !== 36) {
          warn(`[sparx] Invalid or missing activityId for item ${item}. Skipping to next.`);
          item++;
          try { buffer = await client.getActivity(packageId, task.taskId, item); } catch(e) { break; }
          continue;
        }

        const cleanPrompt = parsed.prompt.replace(/\s+/g, ' ').trim();
        const cleanChoices = parsed.choices.map(c => c.text.replace(/\s+/g, ' ').trim());

        let ai = await getAIanswer({ 
          kind: parsed.type === 'multiple' ? 'multiple_choice' : 'short_answer', 
          prompt: cleanPrompt, 
          choices: cleanChoices, 
          image: parsed.image || null, 
          fields: parsed.numberFields || parsed.textFields 
        }, session);

        let components = [];
        let eliminatedChoices = [];
        let retries = 0;
        let answerResolved = false;

        while (retries < 3) {
          const validation = validateAnswer(ai, parsed);
          if (validation.valid) {
            try {
              if (parsed.type === 'number') {
                components = parsed.numberFields.map(f => ({ key: f.ref || 'field', value: String(validation.answers[f.ref] || '0') }));
              } else if (parsed.type === 'text') {
                components = parsed.textFields.map(f => ({ key: f.ref || 'field', value: String(validation.answers[f.ref] || '') }));
              } else if (parsed.type === 'slot') {
                const slot = parsed.slots[0];
                const card = parsed.choices.find(c => c.text === ai.answer) || parsed.choices[0];
                const slotMsg = Buffer.concat([Buffer.from([0x0a, (slot.ref||'').length]), Buffer.from(slot.ref||'')]);
                const inner = Buffer.concat([Buffer.from([0x0a, slotMsg.length]), slotMsg, Buffer.from([0x12, (card.ref||'').length]), Buffer.from(card.ref||'')]);
                buffer = await client.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', Buffer.concat([Buffer.from([0x0a, parsed.activityId.length+11]), Buffer.from('/activities/'+parsed.activityId), Buffer.from([0x12, inner.length]), inner]));
                taskCorrect++; item++;
                await sleep(humanDelay(minMs, maxMs, item === 2));
                answerResolved = true; break;
              } else {
                const chosen = parsed.choices.find(c => c.text.trim().toLowerCase() === ai.answer.trim().toLowerCase()) || parsed.choices[0];
                components = [{ key: chosen.ref || 'choice', value: chosen.text || '' }];
              }
            } catch (err) {
              warn(`[sparx] Error building components: ${err.message}`);
              break;
            }
            answerResolved = true; break;
          }
          
          retries++;
          warn(`[sparx] answer validation failed (attempt ${retries}): ${validation.reason}`);
          
          if (parsed.type === 'multiple' || parsed.type === 'slot') {
            eliminatedChoices.push(ai.answer);
            const retryResult = await retryWithElimination({ parsed, session, eliminatedChoices });
            if (!retryResult) break;
            ai = retryResult.ai;
          } else {
            ai = await getAIanswer({ kind: parsed.type === 'number' ? 'number' : 'short_answer', prompt: cleanPrompt, choices: cleanChoices, image: parsed.image || null, fields: parsed.numberFields || parsed.textFields }, session);
          }
        }

        if (!answerResolved) { 
          warn('[sparx] AI failed to resolve answer, skipping question ' + item); 
          onLog('Skipped question ' + item + ' (AI failed)'); 
          item++; 
          try { buffer = await client.getActivity(packageId, task.taskId, item); } catch(e) { break; }
          continue; 
        }

        const waitMs = humanDelay(minMs, maxMs, item === 1);
        await sleep(waitMs);
        if (signal.cancelled) break;

        if (components.length === 0 || !components[0].key || !components[0].value) {
          warn(`[sparx] Invalid components for item ${item}. Skipping submission.`);
          item++;
          try { buffer = await client.getActivity(packageId, task.taskId, item); } catch(e) { break; }
          continue;
        }

        let responseBuffer;
        try { 
          responseBuffer = await client.submitQuestion(parsed.activityId, components); 
        } catch (err) { 
          warn('[sparx] submit failed: ' + err.message); 
          break; 
        }

        taskCorrect++;
        totalCorrect++;
        questionsCompleted++;
        onLog(`Completed question ${item}/${task.total} in ${task.title}`);
        
        item++;
        try { buffer = await client.getActivity(packageId, task.taskId, item); } catch(e) { break; }
      }
      
      onLog(`Completed Task ${task.title}: ${taskCorrect} correct`);
    }
  } finally {
    // Cleanup if needed
  }

  return { success: true, totalCorrect, questionsCompleted, failedTasks };
}
