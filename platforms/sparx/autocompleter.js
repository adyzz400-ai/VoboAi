// language: JavaScript (ESM), file: platforms/sparx/autocompleter.js
// *SenAi/ChurrosAi parity: bookwork bypass, smart retry, keepalive, validation, human timing*

import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { log, warn } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { getAIanswer } from '../educake/getAIanswer.js';
import { parseSparxQuestion, parseBookworkCode } from './parser.js';
import { SparxClient } from './client.js';
import { renderMultiBar } from '../../utils/progressBar.js';

function waitWindow(session) {
  const w = session?.waits || { min: 8, max: 15 };
  const minMs = Math.max(1, Number(w.min) || 8) * 1000;
  const maxMs = Math.max(minMs, (Number(w.max) || 15) * 1000);
  return { minMs, maxMs };
}

function humanDelay(minMs, maxMs, isFirstQuestion = false) {
  const base = isFirstQuestion ? minMs * 1.5 : minMs;
  const range = maxMs - base;
  const u1 = Math.random(), u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const jittered = base + range * (0.5 + gaussian * 0.15);
  return Math.max(minMs, Math.min(maxMs * 1.2, jittered));
}

function cancelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sparx:cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );
}

function startKeepalive(session) {
  const interval = setInterval(async () => {
    try {
      const client = new SparxClient(session);
      await client.getHomeworkList();
      log('[sparx] keepalive ping OK');
    } catch (err) {
      warn('[sparx] keepalive failed: ' + err.message);
    }
  }, 45 * 1000);
  return interval;
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
      return { valid: false, reason: `answer "${ai.answer}" not in choices: ${choices.join(', ')}` };
    }
    return { valid: true, answer: ai.answer };
  }

  if (parsed.type === 'number' || parsed.type === 'text') {
    if (!ai.answers || Object.keys(ai.answers).length === 0) {
      return { valid: false, reason: 'no structured answers returned' };
    }
    return { valid: true, answers: ai.answers };
  }

  return { valid: true, answer: ai.answer };
}

async function retryWithElimination({ parsed, session, eliminatedChoices }) {
  const remaining = parsed.choices.filter(c => !eliminatedChoices.includes(c.text));
  if (remaining.length === 0) return null;

  const ai = await getAIanswer(
    {
      kind: 'multiple_choice',
      prompt: parsed.prompt,
      choices: remaining.map(c => c.text),
      image: parsed.image,
      fields: parsed.numberFields || parsed.textFields
    },
    session
  );

  if (!ai || !ai.answer) return null;
  const chosen = remaining.find(c => c.text.trim().toLowerCase() === ai.answer.trim().toLowerCase()) || remaining[0];
  return { chosen, ai };
}

export async function runSparxPackage({ session, packageId, homework, interaction, signal, onLog }) {
  const client = new SparxClient(session);
  const keepalive = startKeepalive(session);

  const taskProgress = {};
  homework.tasks.forEach((t) => {
    taskProgress[t.taskId] = { label: t.title, filled: 0, total: t.isTimesTables ? 30 : 10 };
  });

  const failedTasks = [];
  let totalCorrect = 0, questionsCompleted = 0;
  const totalQuestions = homework.tasks.reduce((sum, t) => sum + (t.isTimesTables ? 30 : 10), 0);
  const startTime = Date.now();
  const { minMs, maxMs } = waitWindow(session);

  try {
    for (let i = 0; i < homework.tasks.length; i++) {
      if (signal.cancelled) break;
      const task = homework.tasks[i];
      onLog('Starting ' + task.title + '...');

      if (task.isTimesTables) {
        let ttCorrect = 0;
        for (let q = 0; q < 30; q++) {
          if (signal.cancelled) break;
          const a = Math.floor(Math.random() * 12) + 1;
          const b = Math.floor(Math.random() * 12) + 1;
          const promptStr = a + 'x' + b + '=?';
          const answerStr = String(a * b);
          taskProgress[task.taskId].filled = q + 1;
          questionsCompleted = homework.tasks.slice(0, i).reduce((s, t) => s + (t.isTimesTables ? 30 : 10), 0) + (q + 1);
          await updateUI(interaction, taskProgress, homework, task.title, a + ' × ' + b + ' = ?', questionsCompleted, totalQuestions, totalCorrect + ttCorrect, startTime, null);
          try {
            await client.submitTimesTablesOne(packageId, task.taskId, promptStr, answerStr);
            ttCorrect++;
          } catch (e) {
            warn('[sparx] times tables submit failed: ' + e.message);
          }
          await sleep(800 + Math.random() * 500);
        }
        taskProgress[task.taskId].filled = 30;
        totalCorrect += ttCorrect;
        continue;
      }

      try {
        try {
          const bwBuffer = await client.getBookworkCheck(packageId, task.taskId);
          const bwCode = parseBookworkCode(bwBuffer);
          if (bwCode) {
            log('[sparx] bookwork code extracted: ' + bwCode);
            await client.submitBookworkCheck(packageId, task.taskId, bwCode);
            onLog('Bookwork bypass: ' + bwCode);
          }
        } catch (err) {
          warn('[sparx] bookwork bypass failed: ' + err.message);
        }

        let item = 1;
        let buffer = await client.getActivity(packageId, task.taskId, item);
        let taskCorrect = 0;
        const maxRetries = 3;

        while (!signal.cancelled) {
          let parsed;
          try {
            parsed = parseSparxQuestion(buffer);
          } catch (err) {
            warn('[sparx] parse failed on item ' + item + ': ' + err.message);
            break;
          }

          const { prompt, choices, activityId, type } = parsed;
          if (!activityId) {
            log('[sparx] no activityId — task complete or malformed response');
            break;
          }

          taskProgress[task.taskId].filled = item - 1;
          questionsCompleted = homework.tasks.slice(0, i).reduce((s, t) => s + (t.isTimesTables ? 30 : 10), 0) + (item - 1);
          await updateUI(interaction, taskProgress, homework, task.title, prompt, questionsCompleted, totalQuestions, totalCorrect + taskCorrect, startTime, '🤖 Thinking…');

          await client.readyQuestion(activityId).catch(() => {});

          const cleanPrompt = String(prompt || '').replace(/\$/g, '');
          const cleanChoices = choices.map((c) => String(c.text || '').replace(/\$/g, ''));

          let ai = await getAIanswer(
            { kind: type === 'multiple' ? 'multiple_choice' : 'short_answer', prompt: cleanPrompt, choices: cleanChoices, image: parsed.image || null, fields: parsed.numberFields || parsed.textFields },
            session
          );

          let components = [];
          let eliminatedChoices = [];
          let retries = 0;

          while (retries < maxRetries) {
            const validation = validateAnswer(ai, parsed);

            if (validation.valid) {
              if (type === 'number') {
                components = parsed.numberFields.map(f => ({ key: f.ref, value: String(validation.answers[f.ref] || '0') }));
              } else if (type === 'text') {
                components = parsed.textFields.map(f => ({ key: f.ref, value: String(validation.answers[f.ref] || '') }));
              } else if (type === 'slot') {
                const slot = parsed.slots[0];
                const card = choices.find(c => c.text === ai.answer) || choices[0];
                const slotMsg = Buffer.concat([Buffer.from([0x0a, slot.ref.length]), Buffer.from(slot.ref)]);
                const inner = Buffer.concat([Buffer.from([0x0a, slotMsg.length]), slotMsg, Buffer.from([0x12, card.ref.length]), Buffer.from(card.ref)]);
                buffer = await client.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', Buffer.concat([Buffer.from([0x0a, activityId.length+11]), Buffer.from('/activities/'+activityId), Buffer.from([0x12, inner.length]), inner]));
                taskCorrect++; item++;
                await sleep(humanDelay(minMs, maxMs, item === 2));
                continue;
              } else {
                const chosen = choices.find(c => c.text.trim().toLowerCase() === ai.answer.trim().toLowerCase()) || choices[0];
                components = [{ key: chosen.ref, value: chosen.text }];
              }
              break;
            }

            retries++;
            warn(`[sparx] answer validation failed (attempt ${retries}): ${validation.reason}`);
            onLog(`Retry ${retries}/${maxRetries} — eliminating wrong answer`);

            if (type === 'multiple' || type === 'slot') {
              eliminatedChoices.push(ai.answer);
              const retryResult = await retryWithElimination({ parsed, session, eliminatedChoices });
              if (!retryResult) break;
              ai = retryResult.ai;
              components = [{ key: retryResult.chosen.ref, value: retryResult.chosen.text }];
            } else {
              ai = await getAIanswer(
                { kind: type === 'number' ? 'number' : 'short_answer', prompt: cleanPrompt, choices: cleanChoices, image: parsed.image || null, fields: parsed.numberFields || parsed.textFields },
                session
              );
            }
          }

          const waitMs = humanDelay(minMs, maxMs, item === 1);
          let waited = 0;
          while (waited < waitMs) {
            if (signal.cancelled) break;
            await sleep(1000); waited += 1000;
            await updateUI(interaction, taskProgress, homework, task.title, prompt, questionsCompleted, totalQuestions, totalCorrect + taskCorrect, startTime, '⏳ Waiting **' + Math.ceil((waitMs - waited) / 1000) + 's**…');
          }
          if (signal.cancelled) break;

          let responseBuffer;
          try {
            responseBuffer = await client.submitQuestion(activityId, components);
          } catch (err) {
            warn('[sparx] submit failed: ' + err.message);
            break;
          }

          if (responseBuffer && responseBuffer.length > 5000) {
            onLog('Wrong answer on ' + task.title + ' item ' + item + '. Retrying...');
            try {
              const cont = parseSparxQuestion(responseBuffer);
              if (cont.activityId) {
                buffer = await client.continueActivity(cont.activityId);
              } else {
                item++;
              }
            } catch (e) {
              warn('[sparx] continue failed: ' + e.message);
              item++;
            }
          } else {
            taskCorrect++;
            item++;
          }

          if (!responseBuffer || responseBuffer.length < 100) {
            log('[sparx] short response — likely end of task');
            break;
          }
        }

        taskProgress[task.taskId].filled = item - 1;
        totalCorrect += taskCorrect;
        onLog('Completed ' + task.title + ': ' + taskCorrect + ' correct');
      } catch (err) {
        onLog('Failed to complete ' + task.title + ': ' + err.message);
        failedTasks.push({ title: task.title, error: err.message });
      }
    }
  } finally {
    clearInterval(keepalive);
  }

  return { success: !signal.cancelled && failedTasks.length === 0 && questionsCompleted > 0, cancelled: !!signal.cancelled, totalCorrect, questionsCompleted, failedTasks };
}

async function updateUI(interaction, progress, homework, currentTaskName, questionText, qCompleted, qTotal, score, startTime, statusText) {
  const barBuf = renderMultiBar({ bars: Object.values(progress), accent: '#0A78FF', labelWidth: 160 });
  const file = new AttachmentBuilder(barBuf, { name: 'progress.png' });
  const mins = Math.floor((Date.now() - startTime) / 60000);
  const secs = Math.floor(((Date.now() - startTime) % 60000) / 1000);
  const dueStr = homework.dueDate ? new Date(homework.dueDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

  const embed = new EmbedBuilder()
    .setColor(0x0a78ff)
    .setAuthor({ name: 'Vobo AI · Sparx Maths' })
    .setTitle('Homework due ' + dueStr)
    .setDescription(
      '**Name**: ' + homework.title + '\n' +
      '**Status**: ' + currentTaskName + (statusText ? ' (' + statusText + ')' : '') + '\n' +
      '**Question**: ' + String(questionText).slice(0, 150) + '\n\n' +
      '📊 **Progress**\n' +
      '**Questions Completed**: ' + qCompleted + '/' + qTotal + '\n' +
      '**Time spent**: ' + mins + 'm ' + secs + 's\n' +
      '**Score so far**: ' + score + ' correct'
    ).setImage('attachment://progress.png');

  await interaction.editReply({ embeds: [embed], files: [file], components: [cancelRow()] }).catch(() => {});
}
