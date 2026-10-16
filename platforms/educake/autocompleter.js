// language: JavaScript (ESM), file: platforms/educake/autocompleter.js
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { submitAnswer } from './quizzes.js';
import { coerceGivenAnswer } from './parser.js';
import { getAIanswer } from './getAIanswer.js';
import { renderEducakeProgress } from './progress.js';

const ACCENT = parseInt(config.accent.replace('#', ''), 16);

function buildProgressEmbed({ quizTitle, index, total, q, waitUntilUnix, correct, incorrect, status }) {
  const e = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: 'Vobo AI · running' })
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

export async function runAttempt({ session, attemptId, attempt, interaction, signal, model, quizTitle }) {
  const order = attempt.questions.map(String);
  const map = attempt.questionMap ?? {};
  const total = order.length;
  let correct = 0, incorrect = 0, unmarked = 0, noAnswer = 0;

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

    const barBuf = await renderEducakeProgress(i, total);
    await interaction.editReply({
      embeds: [buildProgressEmbed({ quizTitle, index: i, total, q: normQ, correct, incorrect, status: 'asking AI…' })],
      files: [new AttachmentBuilder(barBuf, { name: 'progress.png' })],
      components: [runningButtons()],
    }).catch(() => {});

    // ask Gemini (with retry + fallback chain)
    let geminiResp = null;
    let geminiFailed = false;
    try { geminiResp = await getAIanswer(normQ, session, { model }); }
    catch (err) { warn(`[run] gemini threw on Q${i + 1}: ${err.message}`); geminiFailed = true; }

    if (!geminiResp?.answer) geminiFailed = true;

    let given;
    if (geminiFailed) {
      // safe fallback per question kind — never empty (Educake 400s on empty)
      if (normQ.kind === 'multiple_choice' && normQ.choices?.length) given = normQ.choices[0];
      else if (normQ.kind === 'number') given = '0';
      else given = 'unknown';
      noAnswer++;
      log(`[run] Q${i + 1} had no AI answer — submitting fallback "${given}"`);
    } else {
      given = coerceGivenAnswer(normQ, geminiResp.answer);
      if (!given) {
        // coerce rejected the model output — pick something non-empty
        given = normQ.kind === 'multiple_choice' && normQ.choices?.length ? normQ.choices[0] : 'unknown';
      }
    }

    const minMs = Math.max(1, (session.waits?.min ?? config.waits.min)) * 1000;
    const maxMs = Math.max(minMs, (session.waits?.max ?? config.waits.max)) * 1000;
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

    let res = null;
    try {
      res = await submitAnswer(session, {
        attemptId,
        testQuestionId: q.testQuestionId,
        variantId: q.id,
        givenAnswer: given,
      });
    } catch (err) { warn(`[run] submit failed on Q${i + 1}: ${err.message}`); }

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
      geminiFailed,
    });
  }

  return {
    quizTitle: quizTitle || attempt.name || 'Educake quiz',
    total,
    correct,
    incorrect,
    unmarked,
    noAnswer,
    cancelled: !!signal.cancelled,
    durationSeconds: Math.floor((Date.now() - (session.startedAt ?? Date.now())) / 1000),
    results,
  };
}