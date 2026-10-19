// language: JavaScript (ESM), file: platforms/sparx/autocompleter.js
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { log } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { getAIanswer } from '../educake/getAIanswer.js'; 
import { parseSparxQuestion, parseBookworkCode } from './parser.js';
import { SparxClient } from './client.js';
import { renderMultiBar } from '../../utils/progressBar.js';

export async function runSparxPackage({ session, packageId, homework, interaction, signal, onLog }) {
  const client = new SparxClient(session);
  
  const taskProgress = {};
  homework.tasks.forEach(t => {
    taskProgress[t.taskId] = { label: t.title, filled: 0, total: 10 };
  });

  let totalCorrect = 0;
  let totalQuestions = homework.tasks.length * 10;
  let questionsCompleted = 0;
  const startTime = Date.now();

  for (let i = 0; i < homework.tasks.length; i++) {
    if (signal.cancelled) break;
    const task = homework.tasks[i];
    
    onLog(`Starting ${task.title}...`);

    if (task.isTimesTables) {
      const totalTTOuestions = 30;
      const answersToSubmit = [];
      for (let q = 0; q < totalTTOuestions; q++) {
        if (signal.cancelled) break;
        const num1 = Math.floor(Math.random() * 12) + 1;
        const num2 = Math.floor(Math.random() * 12) + 1;
        answersToSubmit.push(String(num1 * num2));
        
        taskProgress[task.taskId].filled = q;
        questionsCompleted = (i * 10) + q; // Approximate
        
        await updateUI(interaction, taskProgress, homework, task.title, `${num1} × ${num2} = ?`, questionsCompleted, totalQuestions, totalCorrect, startTime);
        await sleep(1000);
      }
      if (!signal.cancelled) {
        try {
          await client.submitTimesTables(packageId, task.taskId, answersToSubmit);
          taskProgress[task.taskId].filled = 10;
          totalCorrect += totalTTOuestions;
        } catch (e) { onLog('Times Tables submit failed: ' + e.message); }
      }
      continue;
    }

    if (task.isFlashcards) {
      taskProgress[task.taskId].filled = 10;
      questionsCompleted = (i + 1) * 10;
      await updateUI(interaction, taskProgress, homework, task.title, 'Swiping flashcards...', questionsCompleted, totalQuestions, totalCorrect, startTime);
      await sleep(2000);
      continue;
    }

    try {
      try {
        const bwBuffer = await client.getBookworkCheck(packageId, task.taskId);
        const bwCode = parseBookworkCode(bwBuffer);
        if (bwCode) await client.submitBookworkCheck(packageId, task.taskId, bwCode);
      } catch (e) { }

      let item = 1;
      let buffer = await client.getActivity(packageId, task.taskId, item);
      let taskCorrect = 0;
      const tQuestions = 10;

      while (item <= tQuestions && !signal.cancelled) {
        let { prompt, choices, activityId } = parseSparxQuestion(buffer);
        
        taskProgress[task.taskId].filled = item - 1;
        questionsCompleted = (i * 10) + (item - 1);
        
        await updateUI(interaction, taskProgress, homework, task.title, prompt, questionsCompleted, totalQuestions, totalCorrect, startTime);
        
        const cleanPrompt = prompt.replace(/\$/g, '');
        const cleanChoices = choices.map(c => c.text.replace(/\$/g, ''));
        
        const normQ = { kind: 'multiple_choice', prompt: cleanPrompt, choices: cleanChoices, image: null, unit: null };
        const geminiResp = await getAIanswer(normQ, session);
        
        let chosenRef = null;
        const exact = choices.find(c => c.text.replace(/\$/g, '') === geminiResp.answer);
        if (exact) chosenRef = exact.ref;
        else {
          const clean = geminiResp.answer.replace(/\s+/g, '').toLowerCase();
          const close = choices.find(c => c.text.replace(/\$/g, '').replace(/\s+/g, '').toLowerCase() === clean);
          if (close) chosenRef = close.ref;
        }
        if (!chosenRef) chosenRef = choices[0].ref;
        const chosenText = choices.find(c => c.ref === chosenRef).text;

        const waitMs = 8000 + Math.random() * 7000;
        let waited = 0;
        while (waited < waitMs) {
          if (signal.cancelled) break;
          await sleep(500);
          waited += 500;
        }
        if (signal.cancelled) break;

        buffer = await client.submitAnswer(activityId, chosenRef, chosenText);
        
        if (buffer.length > 5000) {
          onLog(`Wrong answer on ${task.title}. Continuing...`);
          const { activityId: continueActId } = parseSparxQuestion(buffer);
          if (continueActId) {
            buffer = await client.continueActivity(continueActId);
          }
        } else {
          taskCorrect++;
        }
        item++;
      }

      taskProgress[task.taskId].filled = 10;
      totalCorrect += taskCorrect;
      
    } catch (err) {
      onLog(`Failed to complete ${task.title}: ${err.message}`);
    }
  }

  return { success: true, totalCorrect };
}

async function updateUI(interaction, progress, homework, currentTaskName, questionText, qCompleted, qTotal, score, startTime) {
  const barBuf = renderMultiBar({ 
    bars: Object.values(progress),
    accent: '#0A78FF',
    labelWidth: 160
  });
  const file = new AttachmentBuilder(barBuf, { name: 'progress.png' });

  // Format the SenAI layout text
  const mins = Math.floor((Date.now() - startTime) / 60000);
  const secs = Math.floor(((Date.now() - startTime) % 60000) / 1000);
  const timeSpent = `${mins}m ${secs}s`;

  const embed = new EmbedBuilder()
    .setColor(0x0A78FF)
    .setAuthor({ name: 'Vobo AI · Sparx Maths' })
    .setTitle(`Homework due ${new Date(homework.dueDate).toLocaleDateString()}`)
    .setDescription(
      `**Name**: ${homework.title}\n` +
      `**Status**: ${currentTaskName}\n` +
      `**Question**: ${questionText.slice(0, 150)}\n\n` +
      `📊 **Progress**\n` +
      `**Questions Completed**: ${qCompleted}/${qTotal}\n` +
      `**Time spent**: ${timeSpent}\n` +
      `**Score so far**: ${score} correct`
    )
    .setImage('attachment://progress.png');

  await interaction.editReply({ embeds: [embed], files: [file] }).catch(() => {});
}
