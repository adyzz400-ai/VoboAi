// language: JavaScript (ESM), file: platforms/sparx/autocompleter.js
import {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { log } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { getAIanswer } from '../educake/getAIAnswer.js';
import { parseSparxQuestion, parseBookworkCode } from './parser.js';
import { SparxClient } from './client.js';
import { renderMultiBar } from '../../utils/progressBar.js';

function waitWindow(session) {
  const w =
    session && session.waits ? session.waits : { min: 8, max: 15 };
  const minMs = Math.max(1, Number(w.min) || 8) * 1000;
  const maxMs = Math.max(minMs, Number(w.max) || 15) * 1000;
  return { minMs, maxMs };
}

function cancelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sparx:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );
}

export async function runSparxPackage({
  session,
  packageId,
  homework,
  interaction,
  signal,
  onLog
}) {
  const client = new SparxClient(session);

  const taskProgress = {};
  homework.tasks.forEach((t) => {
    taskProgress[t.taskId] = {
      label: t.title,
      filled: 0,
      total: t.isTimesTables ? 30 : 10
    };
  });

  const failedTasks = [];
  let totalCorrect = 0;
  let questionsCompleted = 0;
  const totalQuestions = homework.tasks.reduce(
    (sum, t) => sum + (t.isTimesTables ? 30 : 10),
    0
  );
  const startTime = Date.now();
  const { minMs, maxMs } = waitWindow(session);

  for (let i = 0; i < homework.tasks.length; i++) {
    if (signal.cancelled) break;
    const task = homework.tasks[i];
    onLog('Starting ' + task.title + '...');

    // --- TIMES TABLES ---
    if (task.isTimesTables) {
      let ttCorrect = 0;
      const totalTT = 30;
      for (let q = 0; q < totalTT; q++) {
        if (signal.cancelled) break;
        const a = Math.floor(Math.random() * 12) + 1;
        const b = Math.floor(Math.random() * 12) + 1;
        const promptStr = a + 'x' + b + '=?';
        const answerStr = String(a * b);

        taskProgress[task.taskId].filled = q + 1;
        questionsCompleted =
          homework.tasks
            .slice(0, i)
            .reduce((s, t) => s + (t.isTimesTables ? 30 : 10), 0) +
          (q + 1);
        await updateUI(
          interaction,
          taskProgress,
          homework,
          task.title,
          a + ' × ' + b + ' = ?',
          questionsCompleted,
          totalQuestions,
          totalCorrect + ttCorrect,
          startTime
        );

        try {
          await client.submitTimesTablesOne(
            packageId,
            task.taskId,
            promptStr,
            answerStr
          );
          ttCorrect++;
        } catch (e) {
          onLog('Times Tables q' + (q + 1) + ' failed: ' + e.message);
        }
        await sleep(800 + Math.random() * 500);
      }
      taskProgress[task.taskId].filled = totalTT;
      totalCorrect += ttCorrect;
      continue;
    }

    // --- STANDARD + FLASHCARDS ---
    try {
      try {
        const bwBuffer = await client.getBookworkCheck(
          packageId,
          task.taskId
        );
        const bwCode = parseBookworkCode(bwBuffer);
        if (bwCode) {
          await client.submitBookworkCheck(
            packageId,
            task.taskId,
            bwCode
          );
        }
      } catch (_) {
        /* absent / already attempted */
      }

      let item = 1;
      let buffer = await client.getActivity(
        packageId,
        task.taskId,
        item
      );
      let taskCorrect = 0;
      const tQuestions = 10;

      while (item <= tQuestions && !signal.cancelled) {
        const parsed = parseSparxQuestion(buffer);
        const { prompt, choices, activityId, type } = parsed;
        const slots = parsed.slots || [];

        log(
          '[sparx] parsed type=' +
            type +
            ' prompt=' +
            JSON.stringify(String(prompt || '').slice(0, 120)) +
            ' choices=' +
            choices.length +
            ' slots=' +
            slots.length +
            (parsed.textField
              ? ' textField=' + parsed.textField.ref
              : '')
        );

        taskProgress[task.taskId].filled = item - 1;
        questionsCompleted =
          homework.tasks
            .slice(0, i)
            .reduce((s, t) => s + (t.isTimesTables ? 30 : 10), 0) +
          (item - 1);
        await updateUI(
          interaction,
          taskProgress,
          homework,
          task.title,
          prompt,
          questionsCompleted,
          totalQuestions,
          totalCorrect + taskCorrect,
          startTime
        );

        const cleanPrompt = String(prompt || '').replace(/\$/g, '');
        const cleanChoices = choices.map((c) =>
          String(c.text || '').replace(/\$/g, '')
        );
        const ai = await getAIanswer(
          {
            kind:
              type === 'text' ? 'short_answer' : 'multiple_choice',
            prompt: cleanPrompt,
            choices: cleanChoices,
            image: null,
            unit: null
          },
          session
        );

        log(
          '[sparx] gemini answer=' +
            JSON.stringify(String((ai && ai.answer) || ''))
        );

        let chosen = null;
        if (choices.length > 0) {
          const target = String((ai && ai.answer) || '')
            .replace(/\s+/g, '')
            .toLowerCase();
          chosen =
            choices.find(
              (c) =>
                String(c.text || '')
                  .replace(/\s+/g, '')
                  .toLowerCase() === target
            ) ||
            choices.find(
              (c) =>
                String(c.text || '').replace(/\$/g, '') ===
                (ai && ai.answer)
            ) ||
            choices[0];
        }

        const waitMs = minMs + Math.random() * (maxMs - minMs);
        let waited = 0;
        while (waited < waitMs) {
          if (signal.cancelled) break;
          await sleep(500);
          waited += 500;
        }
        if (signal.cancelled) break;

        let resultBuffer;
        if (type === 'text') {
          if (!parsed.textField || !parsed.textField.ref) {
            onLog(
              'text item ' + item + ' missing field ref; skipping'
            );
            item++;
            continue;
          }
          const text = String((ai && ai.answer) || '').trim();
          resultBuffer = await client.submitTextAnswer(
            activityId,
            parsed.textField.ref,
            text
          );
        } else if (type === 'slot') {
          const slot = slots[0];
          if (!slot || !chosen) {
            onLog(
              'Flashcard/slot item ' + item + ' incomplete; skipping'
            );
            item++;
            continue;
          }
          resultBuffer = await client.submitFlashcard(
            activityId,
            slot.ref,
            chosen.ref
          );
        } else {
          if (!chosen) {
            onLog('MC item ' + item + ' has no choices; skipping');
            item++;
            continue;
          }
          resultBuffer = await client.submitAnswer(
            activityId,
            chosen.ref,
            chosen.text
          );
        }

        buffer = resultBuffer;
        if (buffer.length > 5000) {
          onLog('Wrong answer on ' + task.title + '. Continuing...');
          try {
            const cont = parseSparxQuestion(buffer);
            if (cont.activityId) {
              buffer = await client.continueActivity(cont.activityId);
            }
          } catch (e) {
            onLog(
              'Could not parse continue buffer: ' + e.message
            );
            break;
          }
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

  return {
    success:
      !signal.cancelled &&
      failedTasks.length === 0 &&
      questionsCompleted > 0,
    cancelled: !!signal.cancelled,
    totalCorrect: totalCorrect,
    questionsCompleted: questionsCompleted,
    failedTasks: failedTasks
  };
}

async function updateUI(
  interaction,
  progress,
  homework,
  currentTaskName,
  questionText,
  qCompleted,
  qTotal,
  score,
  startTime
) {
  const barBuf = renderMultiBar({
    bars: Object.values(progress),
    accent: '#0A78FF',
    labelWidth: 160
  });
  const file = new AttachmentBuilder(barBuf, { name: 'progress.png' });
  const mins = Math.floor((Date.now() - startTime) / 60000);
  const secs = Math.floor(((Date.now() - startTime) % 60000) / 1000);
  const dueStr = homework.dueDate
    ? new Date(homework.dueDate).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      })
    : '—';
  const embed = new EmbedBuilder()
    .setColor(0x0a78ff)
    .setAuthor({ name: 'Vobo AI · Sparx Maths' })
    .setTitle('Homework due ' + dueStr)
    .setDescription(
      '**Name**: ' +
        homework.title +
        '\n' +
        '**Status**: ' +
        currentTaskName +
        '\n' +
        '**Question**: ' +
        String(questionText).slice(0, 150) +
        '\n\n' +
        '📊 **Progress**\n' +
        '**Questions Completed**: ' +
        qCompleted +
        '/' +
        qTotal +
        '\n' +
        '**Time spent**: ' +
        mins +
        'm ' +
        secs +
        's\n' +
        '**Score so far**: ' +
        score +
        ' correct'
    )
    .setImage('attachment://progress.png');

  await interaction
    .editReply({
      embeds: [embed],
      files: [file],
      components: [cancelRow()]
    })
    .catch(() => {});
}
