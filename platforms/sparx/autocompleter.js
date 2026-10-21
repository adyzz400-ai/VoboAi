// language: JavaScript (ESM), file: platforms/sparx/autocompleter.js
import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { log } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { getAIanswer } from '../educake/getAIAnswer.js';
import { parseSparxQuestion, parseBookworkCode } from './parser.js';
import { SparxClient } from './client.js';
import { renderMultiBar } from '../../utils/progressBar.js';

function waitWindow(session) {
  const w = session && session.waits ? session.waits : { min: 8, max: 15 };
  const minMs = Math.max(1, Number(w.min) || 8) * 1000;
  const maxMs = Math.max(minMs, (Number(w.max) || 15) * 1000);
  return { minMs, maxMs };
}

function cancelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sparx:cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );
}

export async function runSparxPackage({ session, packageId, homework, interaction, signal, onLog }) {
  const client = new SparxClient(session);
  const taskProgress = {};
  homework.tasks.forEach((t) => {
    taskProgress[t.taskId] = { label: t.title, filled: 0, total: t.isTimesTables ? 30 : 10 };
  });

  const failedTasks = [];
  let totalCorrect = 0, questionsCompleted = 0;
  const totalQuestions = homework.tasks.reduce((sum, t) => sum + (t.isTimesTables ? 30 : 10), 0);
  const startTime = Date.now();
  const { minMs, maxMs } = waitWindow(session);

  for (let i = 0; i < homework.tasks.length; i++) {
    if (signal.cancelled) break;
    const task = homework.tasks[i];
    onLog('Starting ' + task.title + '...');

    if (task.isTimesTables) {
      let ttCorrect = 0;
      for (let q = 0; q < 30; q++) {
        if (signal.cancelled) break;
        const a = Math.floor(Math.random() * 12) + 1, b = Math.floor(Math.random() * 12) + 1;
        const promptStr = a + 'x' + b + '=?', answerStr = String(a * b);
        taskProgress[task.taskId].filled = q + 1;
        questionsCompleted = homework.tasks.slice(0, i).reduce((s, t) => s + (t.isTimesTables ? 30 : 10), 0) + (q + 1);
        await updateUI(interaction, taskProgress, homework, task.title, a + ' × ' + b + ' = ?', questionsCompleted, totalQuestions, totalCorrect + ttCorrect, startTime, null);
        try { await client.submitTimesTablesOne(packageId, task.taskId, promptStr, answerStr); ttCorrect++; } catch (e) {}
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
        if (bwCode) await client.submitBookworkCheck(packageId, task.taskId, bwCode);
      } catch (_) {}

      let item = 1;
      let buffer = await client.getActivity(packageId, task.taskId, item);
      let taskCorrect = 0, tQuestions = 10;

      while (item <= tQuestions && !signal.cancelled) {
        const parsed = parseSparxQuestion(buffer);
        const { prompt, choices, activityId, type } = parsed;
        
        taskProgress[task.taskId].filled = item - 1;
        questionsCompleted = homework.tasks.slice(0, i).reduce((s, t) => s + (t.isTimesTables ? 30 : 10), 0) + (item - 1);
        await updateUI(interaction, taskProgress, homework, task.title, prompt, questionsCompleted, totalQuestions, totalCorrect + taskCorrect, startTime, '🤖 Thinking…');

        // Signal ready to server
        await client.readyQuestion(activityId).catch(() => {});

        const cleanPrompt = String(prompt || '').replace(/\$/g, '');
        const cleanChoices = choices.map((c) => String(c.text || '').replace(/\$/g, ''));
        
        const ai = await getAIanswer(
          { kind: type === 'multiple' ? 'multiple_choice' : 'short_answer', prompt: cleanPrompt, choices: cleanChoices, image: parsed.image || null, fields: parsed.numberFields || parsed.textFields },
          session
        );

        let components = [];
        if (type === 'number') {
          if (!ai || !ai.answers) throw new Error('AI failed to return fields');
          components = parsed.numberFields.map(f => ({ key: f.ref, value: String(ai.answers[f.ref] || '0') }));
        } else if (type === 'text') {
          if (!ai || !ai.answers) throw new Error('AI failed to return text fields');
          components = parsed.textFields.map(f => ({ key: f.ref, value: String(ai.answers[f.ref] || '') }));
        } else if (type === 'slot') {
          const slot = parsed.slots[0];
          const card = choices.find(c => c.text === ai.answer) || choices[0];
          const slotMsg = Buffer.concat([Buffer.from([0x0a, slot.ref.length]), Buffer.from(slot.ref)]);
          const inner = Buffer.concat([Buffer.from([0x0a, slotMsg.length]), slotMsg, Buffer.from([0x12, card.ref.length]), Buffer.from(card.ref)]);
          buffer = await client.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', Buffer.concat([Buffer.from([0x0a, activityId.length+11]), Buffer.from('/activities/'+activityId), Buffer.from([0x12, inner.length]), inner]));
          taskCorrect++; item++; continue;
        } else {
          const chosen = choices.find(c => c.text === ai.answer) || choices[0];
          components = [{ key: chosen.ref, value: chosen.text }];
        }

        const waitMs = minMs + Math.random() * (maxMs - minMs);
        let waited = 0;
        while (waited < waitMs) {
          if (signal.cancelled) break;
          await sleep(1000); waited += 1000;
          await updateUI(interaction, taskProgress, homework, task.title, prompt, questionsCompleted, totalQuestions, totalCorrect + taskCorrect, startTime, '⏳ Waiting **' + Math.ceil((waitMs - waited) / 1000) + 's**…');
        }
        if (signal.cancelled) break;

        buffer = await client.submitQuestion(activityId, components);
        
        if (buffer.length > 5000) {
          onLog('Wrong answer on ' + task.title + '. Continuing...');
          try {
            const cont = parseSparxQuestion(buffer);
            if (cont.activityId) buffer = await client.continueActivity(cont.activityId);
          } catch (e) { break; }
        } else {
          taskCorrect++;
        }
        item++;
      }

      taskProgress[task.taskId].filled = tQuestions;
      totalCorrect += taskCorrect;
    } catch (err) {
      onLog('Failed to complete ' + task.title + ': ' + err.message);
      failedTasks.push({ title: task.title, error: err.message });
    }
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
