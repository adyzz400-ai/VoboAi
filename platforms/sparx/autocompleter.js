// language: JavaScript (ESM), file: platforms/sparx/autocompleter.js
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { log } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { getAIanswer } from '../educake/getAIanswer.js'; 
import { parseSparxQuestion, parseBookworkCode } from './parser.js';
import { SparxClient } from './client.js';
import { renderMultiBar } from '../../utils/progressBar.js';

export async function runSparxTask({ session, packageId, taskId, taskName, interaction, signal, onLog }) {
  const client = new SparxClient(session);
  
  onLog('Checking for Bookwork...');
  try {
    const bwBuffer = await client.getBookworkCheck(packageId, taskId);
    const bwCode = parseBookworkCode(bwBuffer);
    if (bwCode) {
      onLog('Submitting Bookwork code: ' + bwCode);
      await client.submitBookworkCheck(packageId, taskId, bwCode);
    }
  } catch (err) {
    onLog('Bookwork check skipped.');
  }

  let item = 1;
  let buffer = await client.getActivity(packageId, taskId, item);
  const totalQuestions = 10;
  let correct = 0;
  
  while (item <= totalQuestions && !signal.cancelled) {
    const { prompt, choices, activityId } = parseSparxQuestion(buffer);
    
    const barBuf = renderMultiBar({ 
      bars: [{ label: 'Task: ' + taskName, filled: correct, total: totalQuestions }],
      accent: '#0A78FF',
    });
    const file = new AttachmentBuilder(barBuf, { name: 'progress.png' });
    
    const embed = new EmbedBuilder()
      .setColor(0x0A78FF)
      .setAuthor({ name: 'Vobo AI · Sparx Maths' })
      .setTitle('Running Task: ' + taskName)
      .setDescription(`**Question ${item} of ${totalQuestions}**\n\n**${prompt}**`)
      .addFields({ name: 'Score so far', value: `✓ ${correct} correct` })
      .setImage('attachment://progress.png');

    await interaction.editReply({ embeds: [embed], files: [file] }).catch(() => {});
    
    const normQ = { kind: 'multiple_choice', prompt, choices: choices.map(c => c.text), image: null, unit: null };
    const geminiResp = await getAIanswer(normQ, session);
    
    let chosenRef = null;
    const exact = choices.find(c => c.text === geminiResp.answer);
    if (exact) chosenRef = exact.ref;
    else {
      const clean = geminiResp.answer.replace(/\s+/g, '').toLowerCase();
      const close = choices.find(c => c.text.replace(/\s+/g, '').toLowerCase() === clean);
      if (close) chosenRef = close.ref;
    }
    if (!chosenRef) chosenRef = choices[0].ref;
    
    const chosenText = choices.find(c => c.ref === chosenRef).text;
    
    const minMs = (session.waits?.min || 8) * 1000;
    const maxMs = (session.waits?.max || 15) * 1000;
    const waitMs = minMs + Math.floor(Math.random() * (maxMs - minMs));
    
    let waited = 0;
    while (waited < waitMs) {
      if (signal.cancelled) break;
      await sleep(500);
      waited += 500;
    }
    
    if (signal.cancelled) break;
    
    buffer = await client.submitAnswer(activityId, chosenRef, chosenText);
    correct++;
    item++;
  }
  
  return { success: true, total: item - 1, correct };
}
