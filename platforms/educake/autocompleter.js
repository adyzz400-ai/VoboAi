// languageset: JavaScript (ESM), file: platforms/educake/autocompleter.js
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { submitAnswer } from './quizzes.js';
import { coerceGivenAnswer } from './parser.js';
import { getAIanswer } from './getAIanswer.js';
import { renderEducakeProgress } from './progress.js';
import { getTheme } from '../../hub/sessionStore.js';

function buildProgressEmbed(accent, opts) {
  const e = new EmbedBuilder()
    .setColor(accent)
    .setAuthor({ name: 'Vobo AI · running' })
    .addFields(
      { name: 'Quiz', value: opts.quizTitle || '—' },
      { name: 'Progress', value: 'Question ' + (opts.index + 1) + ' of ' + opts.total },
      { name: 'Current', value: (opts.q?.prompt ?? '—').slice(0, 280) || '—' },
    );
  if (opts.waitUntilUnix) {
    e.addFields({ name: 'Timing', value: 'Next answer: <t:' + Math.floor(opts.waitUntilUnix) + ':R>' });
  }
  e.addFields({ name: 'Score so far', value: '✓ ' + opts.correct + ' correct   ✗ ' + opts.incorrect + ' incorrect' });
  if (opts.status) e.setFooter({ text: opts.status });
  return e;
}

function runningButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomIdLabel('Cancel').setEmoji('⛔').setStyle(ButtonStyle.Danger),
  );
}

export async function runAttempt(args) {
  const session = args.session;
  const attemptId = args.attemptId;
  const attempt = args.attempt;
  const interaction = args.interaction;
  const signal = args.signal;
  const model = args.model;
  const quizTitle = args.quizTitle;
  const userId = args.userId;

  const accent = parseInt(getTheme(userId).replace('#', ''), 16);

  const order = attempt.questions.map(String);
  const map = attempt.questionMap ?? {};
  const total = order.length;
  let correct = 0, incorrect = 0, unmarked = 0, noAnswer = 0;

  const results = [];

  for (let i = 0; i < total; i++) {
    if (signal.cancelled) { log('[run] cancelled by user'); break; }

    const vid = order[i];
    const q = map[vid];
    if (!q) {
      warn('[run] no question object for variant ' + vid + ' — skipping');
      continue;
    }

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
      embeds: [buildProgressEmbed(accent, { quizTitle: quizTitle, index: i, total: total, q: normQ, correct: correct, incorrect: incorrect, status: 'asking AI…' })],
      files: [new AttachmentBuilder(barBuf, { name: 'progress.png' })],
      components: [runningButtons()],
    }).catch(() => {});

    let geminiResp = null;
    let geminiFailed = false;
    try { geminiResp = await getAIanswer(normQ, session, { model: model }); }
    catch (err) { warn('[run] gemini threw on Q' + (i + 1) + ': ' + err.message); geminiFailed = true; }
    if (!geminiResp?.answer) geminiFailed = true;

    let given;
    if (geminiFailed) {
      if (normQ.kind === 'multiple_choice' && normQ.choices?.length) given = normQ.choices[0];
      else if (normQ.kind === 'number') given = '0';
      else given = 'unknown';
      noAnswer++;
      log('[run] Q' + (i + 1) + ' fallback answer: "' + given + '"');
    } else {
      given = coerceGivenAnswer(normQ, geminiResp.answer);
      if (!given) {
        if (normQ.kind === 'multiple_choice' && normQ.choices?.length) given = normQ.choices[0];
        else given = 'unknown';
      }
    }

    const minMs = Math.max(1, (session.waits?.min ?? config.waits.min)) * 1000;
    const maxMs = Math.max(minMs, (session.waits?.max ?? config.waits.max)) * 1000;
    const waitMs = minMs + Math.floor(Math.random() * Math.max(0, maxMs - minMs));
    const waitUntilUnix = Math.floor((Date.now() + waitMs) / 1000);

    await interaction.editReply({
      embeds: [buildProgressEmbed(accent, { quizTitle: quizTitle, index: i, total: total, q: normQ, waitUntilUnix: waitUntilUnix, correct: correct, incorrect: incorrect, status: 'waiting before submit…' })],
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
        attemptId: attemptId,
        testQuestionId: q.testQuestionId,
        variantId: q.id,
        givenAnswer: given,
      });
    } catch (err) { warn('[run] submit failed on Q' + (i + 1) + ': ' + err.message); }

    const isCorrect = res?.result === true;
    const inReview = res?.inReview === true;
    if (isCorrect) correct++;
    else if (inReview) unmarked++;
    else incorrect++;

    results.push({
      index: i,
      prompt: q.question,
      given: given,
      correctAnswers: res?.correctAnswers ?? [],
      reasoning: res?.reasoning ?? '',
      result: res?.result ?? null,
      inReview: inReview,
      type: q.type,
      unit: q.extra || null,
      image: q.image || null,
      geminiFailed: geminiFailed,
    });
  }

  return {
    quizTitle: quizTitle || attempt.name || 'Educake quiz',
    total: total,
    correct: correct,
    incorrect: incorrect,
    unmarked: unmarked,
    noAnswer: noAnswer,
    cancelled: !!signal.cancelled,
    durationSeconds: Math.floor((Date.now() - (session.startedAt ?? Date.now())) / 1000),
    results: results,
  };
}