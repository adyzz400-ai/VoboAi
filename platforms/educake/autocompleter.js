// language: JavaScript (ESM), file: platforms/educake/autocompleter.js
// *The run loop. Iterates attempt.questions in order, asks Gemini, submits, waits, updates UI.*
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';
import { sleep, humanDuration } from '../../utils/formatTime.js';
import { submitAnswer } from './quizzes.js';
import { coerceGivenAnswer } from './parser.js';
import { getAIanswer } from './getAIanswer.js';
import { renderEducakeProgress } from './progress.js';

const ACCENT = parseInt(config.accent.replace('#', ''), 16);

function buildProgressEmbed({ quizTitle, index, total, q, waitUntilUnix, correct, incorrect, status }) {
  const e = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: '📘 Vobo AI · running' })
    .addFields(
      { name: 'Quiz', value: quizTitle || '—' },
      { name: 'Progress', value: `Question ${index + 1} of ${total}` },
      { name: 'Current', value: (q?.prompt ?? '—').slice(0, 280) || '—' },
    );
  if (waitUntilUnix) {
    e.addFields({ name: 'Timing', value: `Next answer: <t:${Math.floor(waitUntilUnix)}:R>` });
  }
  e.addFields({ name: 'Score so far', value: `✓ ${correct} correct   ✗ ${incorrect} incorrect` });
  if (status) e.setFooter({ text: status });
  return e;
}

function runningButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('edu:cancel').setLabel('Cancel').setEmoji('⛔').setStyle(ButtonStyle.Danger),
  );
}

// session: the per-user Educake session (page, jwt, xsrf, credentials, waits, choice of model)
// interaction: the message we're editing (progress embed lives here)
// signal: { cancelled: boolean, paused: boolean }
export async function runAttempt({ session, attemptId, attempt, interaction, signal, model, quizTitle }) {
  const order = attempt.questions.map(String);
  const map = attempt.questionMap ?? {};
  const total = order.length;
  let correct = 0, incorrect = 0, unmarked = 0;

  const results = [];

  for (let i = 0; i < total; i++) {
    if (signal.cancelled) { log('[run] cancelled by user'); break; }

    const vid = order[i];
    const q = map[vid];
    const normQ = {
      variantId: q.id,
      testQuestionId: q.testQuestionId,
      kind: q.type === 'multiple' ? 'multiple_choice' : q.type === 'number' ? 'number' : 'short_answer',
      prompt: q.question,
      choices: q.type === 'multiple' ? (q.choices ?? []) : null,
      unit: q.extra || null,
      image: q.image || null,
    };

    // live "thinking…" state
    const barBuf = await renderEducakeProgress(i, total);
    await interaction.editReply({
      embeds: [buildProgressEmbed({ quizTitle, index: i, total, q: normQ, correct, incorrect, status: 'asking AI…' })],
      files: [new AttachmentBuilder(barBuf, { name: 'progress.png' })],
      components: [runningButtons()],
    }).catch(() => {});

    // ask Gemini
    let rawAnswer = null;
    try { rawAnswer = await getAIanswer(normQ, session, { model }); }
    catch (err) { warn(`[run] gemini failed on Q${i+1}: ${err.message}`); }

    const given = coerceGivenAnswer(normQ, rawAnswer) ?? (normQ.choices?.[0] ?? '');

    // wait window (interruptible by cancel flag in ~250 ms steps)
    const minMs = (session.waits?.min ?? config.waits.min) * 1000;
    const maxMs = (session.waits?.max ?? config.waits.max) * 1000;
    const waitMs = minMs + Math.floor(Math.random() * Math.max(0, maxMs - minMs));
    const waitUntilUnix = Math.floor((Date.now() + waitMs) / 1000);

    await interaction.editReply({
      embeds: [buildProgressEmbed({ quizTitle, index: i, total, q: normQ, waitUntilUnix, correct, incorrect, status: 'waiting before submit…' })],
      files: [new AttachmentBuilder(barBuf, { name: 'progress.png' })],
      components: [runningButtons()],
    }).catch(() => {});

    const step = 250;
    let waited = 0;
    while (waited < waitMs) {
      if (signal.cancelled) break;
      await sleep(Math.min(step, waitMs - waited));
      waited += step;
    }
    if (signal.cancelled) break;

    // submit
    let res = null;
    try {
      res = await submitAnswer(session, {
        attemptId,
        testQuestionId: q.testQuestionId,
        variantId: q.id,
        givenAnswer: given,
      });
    } catch (err) { warn(`[run] submit failed on Q${i+1}: ${err.message}`); }

    const isCorrect = res?.result === true;
    const inReview  = res?.inReview === true;
    if (isCorrect) correct++;
    else if (inReview) unmarked++;
    else incorrect++;

    results.push({
      index: i,
      prompt: q.question,
      given,
      correctAnswers: res?.correctAnswers ?? [],
      reasoning: res?.reasoning ?? '',
      result: res?.result ?? null,
      inReview,
      type: q.type,
      unit: q.extra || null,
      image: q.image || null,
    });
  }

  const finishedBar = await renderEducakeProgress(signal.cancelled ? Math.max(0, correct + incorrect) : total, total);
  const summary = {
    quizTitle: quizTitle || attempt.name || 'Educake quiz',
    total,
    correct,
    incorrect,
    unmarked,
    cancelled: !!signal.cancelled,
    durationSeconds: Math.floor((Date.now() - (session.startedAt ?? Date.now())) / 1000),
    results,
  };
  void summary; void finishedBar; void humanDuration;
  return summary;
}
