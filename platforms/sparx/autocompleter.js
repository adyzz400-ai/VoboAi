// language: JavaScript (ESM), file: platforms/educake/autocompleter.js
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags
} from 'discord.js';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { submitAnswer, finishQuiz } from './quizzes.js';
import { coerceGivenAnswer } from './parser.js';
import { getAIanswer } from './getAIAnswer.js';
import { getTheme } from '../../hub/sessionStore.js';
import { renderSenAIProgressBar } from '../../utils/senaiLayout.js';

function buildProgressContainer(accent, opts) {
  const container = new ContainerBuilder();
  container.setAccentColor(accent);

  const currentNum = opts.index + 1;
  const remainingTotal = opts.total;

  const pct =
    Math.round(
      (opts.correct /
        (opts.correct + opts.incorrect + (remainingTotal - currentNum))) *
        100
    ) || 0;

  const titleText = '### Vobo AI · running';
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(titleText)
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const progressText =
    '**Progress**\n' +
    '**' +
    currentNum +
    '. Question ' +
    currentNum +
    '** `' +
    pct +
    '%` (of ' +
    remainingTotal +
    ' remaining)\n\n' +
    '**Current**\n' +
    ((opts.q?.prompt || '—').slice(0, 280) || '—') +
    '\n\n' +
    (opts.waitUntilUnix
      ? '**Timing**\nNext answer: <t:' +
        Math.floor(opts.waitUntilUnix) +
        ':R>\n\n'
      : '') +
    '**Score so far**\n✓ ' +
    opts.correct +
    ' correct   ✗ ' +
    opts.incorrect +
    ' incorrect';

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(progressText)
  );

  const media = new TextDisplayBuilder().setContent(
    'attachment://progress.png'
  );
  container.addTextDisplayComponents(media);

  const cancelBtn = new ButtonBuilder()
    .setCustomId('edu:cancel')
    .setLabel('Cancel')
    .setEmoji('⛔')
    .setStyle(ButtonStyle.Secondary);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(cancelBtn)
  );

  return { components: [container] };
}

export async function runAttempt(args) {
  try {
    return await _run(args);
  } catch (err) {
    log('[run] CRASHED: ' + err.message);
    throw err;
  }
}

async function _run(args) {
  const session = args.session;
  const attemptId = args.attemptId;
  const attempt = args.attempt;
  const interaction = args.interaction;
  const signal = args.signal;
  const model = args.model;
  const quizTitle = args.quizTitle;
  const userId = args.userId;

  const hex = getTheme(userId);
  const accent = parseInt(hex.replace('#', ''), 16);

  const map = attempt.questionMap || {};
  const order = attempt.questions
    .map(String)
    .filter((id) => map[id] && !map[id].answer);
  const total = order.length;

  if (total === 0) {
    return {
      quizTitle: quizTitle,
      total: 0,
      correct: 0,
      incorrect: 0,
      unmarked: 0,
      noAnswer: 0,
      cancelled: false,
      durationSeconds: 0,
      results: []
    };
  }

  let correct = 0;
  let incorrect = 0;
  let unmarked = 0;
  let noAnswer = 0;
  const results = [];

  for (let i = 0; i < total; i++) {
    if (signal.cancelled) break;

    const vid = order[i];
    const q = map[vid];

    const normQ = {
      variantId: q.id,
      testQuestionId: q.testQuestionId,
      kind:
        q.type === 'multiple'
          ? 'multiple_choice'
          : q.type === 'number'
            ? 'number'
            : 'short_answer',
      prompt: q.question,
      choices: q.type === 'multiple' ? q.choices || [] : null,
      unit: q.extra || null,
      image: q.image || null
    };

    log('[run] Q' + (i + 1) + '/' + total + ' asking Gemini...');

    const barBuf = await renderSenAIProgressBar(i + 1, total, correct);
    const progressFile = new AttachmentBuilder(barBuf, {
      name: 'progress.png'
    });

    const askPayload = buildProgressContainer(accent, {
      quizTitle: quizTitle,
      index: i,
      total: total,
      q: normQ,
      correct: correct,
      incorrect: incorrect,
      status: 'asking AI…'
    });

    askPayload.files = [progressFile];
    askPayload.flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

    await interaction.editReply(askPayload).catch(function () {});

    let geminiResp = null;
    let geminiFailed = false;
    try {
      geminiResp = await getAIanswer(normQ, session, { model: model });
    } catch (err) {
      geminiFailed = true;
    }

    if (!geminiResp || !geminiResp.answer) geminiFailed = true;

    if (geminiFailed) {
      log('[run] AI failed. Aborting.');
      noAnswer += total - i;

      const errContainer = new ContainerBuilder();
      errContainer.setAccentColor(0xed4245);
      errContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '❌ **Gemini API rate limit reached.**\nPlease wait 60 seconds and press Start again.\n\nNo bad answers were submitted.'
        )
      );

      await interaction
        .editReply({
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          components: [errContainer]
        })
        .catch(function () {});
      break;
    }

    let given = coerceGivenAnswer(normQ, geminiResp.answer);
    if (!given) given = geminiResp.answer;

    let minSec = Number(session.waits?.min || config.waits.min);
    let maxSec = Number(session.waits?.max || config.waits.max);
    if (minSec < 8) minSec = 8;
    if (maxSec < 15) maxSec = 15;

    const waitMs =
      minSec * 1000 +
      Math.floor(
        Math.random() * Math.max(0, maxSec * 1000 - minSec * 1000)
      );
    const waitUntilUnix = Math.floor((Date.now() + waitMs) / 1000);

    log('[run] Q' + (i + 1) + ' waiting ' + Math.round(waitMs / 1000) + 's');
    const waitPayload = buildProgressContainer(accent, {
      quizTitle: quizTitle,
      index: i,
      total: total,
      q: normQ,
      waitUntilUnix: waitUntilUnix,
      correct: correct,
      incorrect: incorrect,
      status: 'waiting before submit…'
    });

    waitPayload.files = [progressFile];
    waitPayload.flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

    await interaction.editReply(waitPayload).catch(function () {});

    let waited = 0;
    while (waited < waitMs) {
      if (signal.cancelled) break;
      await sleep(Math.min(500, waitMs - waited));
      waited += 500;
    }
    if (signal.cancelled) break;

    log('[run] Q' + (i + 1) + ' submitting: "' + given + '"');
    let res = null;
    try {
      res = await submitAnswer(session, {
        attemptId: attemptId,
        testQuestionId: q.testQuestionId,
        variantId: q.id,
        givenAnswer: given
      });
    } catch (err) {
      warn('[run] submit failed: ' + err.message);
    }

    const isCorrect = res && res.result === true;
    const inReview = res && res.inReview === true;
    if (isCorrect) correct++;
    else if (inReview) unmarked++;
    else incorrect++;

    results.push({
      index: i,
      prompt: q.question,
      given: given,
      correctAnswers: (res && res.correctAnswers) || [],
      reasoning: (res && res.reasoning) || '',
      result: (res && res.result) || null,
      inReview: inReview,
      type: q.type,
      unit: q.extra || null,
      image: q.image || null,
      geminiFailed: geminiFailed
    });
  }

  if (!signal.cancelled && noAnswer === 0) {
    try {
      await finishQuiz(session, attemptId);
    } catch (e) {}
  }

  return {
    quizTitle: quizTitle || attempt.name || 'Educake quiz',
    total: total,
    correct: correct,
    incorrect: incorrect,
    unmarked: unmarked,
    noAnswer: noAnswer,
    cancelled: !!signal.cancelled,
    durationSeconds: Math.floor(
      (Date.now() - (session.startedAt || Date.now())) / 1000
    ),
    results: results
  };
}
