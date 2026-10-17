// language: JavaScript (ESM), file: platforms/educake/autocompleter.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { config } from '../../utils/config.js';
import { log, warn } from '../../utils/logger.js';
import { sleep } from '../../utils/formatTime.js';
import { submitAnswer, finishQuiz } from './quizzes.js';
import { coerceGivenAnswer } from './parser.js';
import { getAIanswer } from './getAIanswer.js';
import { getTheme } from '../../hub/sessionStore.js';
import { renderEducakeProgress } from './progress.js';

function buildProgressEmbed(accent, opts) {
  const e = new EmbedBuilder();
  e.setColor(accent);
  e.setAuthor({ name: 'Vobo AI · running' });
  
  const pct = Math.round(((opts.correct + opts.incorrect) / opts.total) * 100) || 0;
  
  e.addFields(
    { name: 'Quiz', value: opts.quizTitle || '—' },
    { name: 'Progress', value: 'Question ' + (opts.index + 1) + ' of ' + opts.total + ' (' + pct + '%)' },
    { name: 'Current', value: (opts.q?.prompt ?? '—').slice(0, 280) || '—' }
  );
  
  if (opts.waitUntilUnix) {
    e.addFields({ name: 'Timing', value: 'Next answer: <t:' + Math.floor(opts.waitUntilUnix) + ':R>' });
  }
  
  const scoreVal = '✓ ' + opts.correct + ' correct   ✗ ' + opts.incorrect + ' incorrect';
  e.addFields({ name: 'Score so far', value: scoreVal });
  
  if (opts.status) {
    e.setFooter({ text: opts.status });
  }
  
  return e;
}

function runningButtons() {
  const btn = new ButtonBuilder();
  btn.setCustomId('edu:cancel');
  btn.setLabel('Cancel');
  btn.setEmoji('⛔');
  btn.setStyle(ButtonStyle.Danger);
  
  const row = new ActionRowBuilder();
  row.addComponents(btn);
  return row;
}

export async function runAttempt(args) {
  try {
    return await _run(args);
  } catch (err) {
    log('[run] CRASHED: ' + err.message);
    log(err.stack);
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

  // Fetch the user's chosen theme color
  const hex = getTheme(userId);
  const accent = parseInt(hex.replace('#', ''), 16);

  const map = attempt.questionMap ?? {};
  
  const order = attempt.questions
    .map(String)
    .filter(id => map[id] && !map[id].answer);

  const total = order.length;
  
  if (total === 0) {
    log('[run] No unanswered questions found.');
    return { quizTitle, total: 0, correct: 0, incorrect: 0, unmarked: 0, noAnswer: 0, cancelled: false, durationSeconds: 0, results: [] };
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
      kind: q.type === 'multiple' ? 'multiple_choice' : q.type === 'number' ? 'number' : 'short_answer',
      prompt: q.question,
      choices: q.type === 'multiple' ? (q.choices ?? []) : null,
      unit: q.extra || null,
      image: q.image || null,
    };

    log('[run] Q' + (i+1) + '/' + total + ' asking Gemini...');
    const embed = buildProgressEmbed(accent, { 
      quizTitle, index: i, total, q: normQ, correct, incorrect, status: 'asking AI…' 
    });
    
    // Pass current correct/incorrect to the progress bar text
    const barBuf = await renderEducakeProgress(i, total, correct, incorrect);
    const progressFile = new AttachmentBuilder(barBuf, { name: 'progress.png' });

    await interaction.editReply({
      embeds: [embed],
      files: [progressFile],
      components: [runningButtons()],
    }).catch(function() {});

    let geminiResp = null;
    let geminiFailed = false;
    
    try { 
      geminiResp = await getAIanswer(normQ, session, { model: model }); 
      log('[run] Q' + (i+1) + ' Gemini OK');
    } catch (err) { 
      warn('[run] Q' + (i+1) + ' gemini threw: ' + err.message); 
      geminiFailed = true; 
    }
    
    if (!geminiResp || !geminiResp.answer) geminiFailed = true;

    let given;
    if (geminiFailed) {
      if (normQ.kind === 'multiple_choice' && normQ.choices?.length) given = normQ.choices[0];
      else if (normQ.kind === 'number') given = '0';
      else given = 'unknown';
      noAnswer++;
    } else {
      given = coerceGivenAnswer(normQ, geminiResp.answer);
      if (!given) {
        if (normQ.kind === 'multiple_choice' && normQ.choices?.length) given = normQ.choices[0];
        else given = 'unknown';
      }
    }

    let minSec = Number(session.waits?.min ?? config.waits.min);
    let maxSec = Number(session.waits?.max ?? config.waits.max);
    if (!Number.isFinite(minSec) || minSec < 1 || minSec > 200) minSec = 4;
    if (!Number.isFinite(maxSec) || maxSec < minSec || maxSec > 200) maxSec = 12;

    const minMs = minSec * 1000;
    const maxMs = maxSec * 1000;
    const waitMs = minMs + Math.floor(Math.random() * Math.max(0, maxMs - minMs));
    const waitUntilUnix = Math.floor((Date.now() + waitMs) / 1000);

    log('[run] Q' + (i+1) + ' waiting ' + Math.round(waitMs/1000) + 's');
    const waitEmbed = buildProgressEmbed(accent, { 
      quizTitle, index: i, total, q: normQ, waitUntilUnix, correct, incorrect, status: 'waiting before submit…' 
    });

    await interaction.editReply({
      embeds: [waitEmbed],
      files: [progressFile],
      components: [runningButtons()],
    }).catch(function() {});

    const step = 500;
    let waited = 0;
    while (waited < waitMs) {
      if (signal.cancelled) break;
      await sleep(Math.min(step, waitMs - waited));
      waited += step;
    }
    if (signal.cancelled) break;

    log('[run] Q' + (i+1) + ' submitting: "' + given + '"');
    let res = null;
    try {
      res = await submitAnswer(session, {
        attemptId,
        testQuestionId: q.testQuestionId,
        variantId: q.id,
        givenAnswer: given,
      });
      log('[run] Q' + (i+1) + ' result: ' + (res?.result ? 'Correct' : 'Incorrect'));
    } catch (err) { 
      warn('[run] Q' + (i + 1) + ' submit failed: ' + err.message); 
    }

    const isCorrect = res?.result === true;
    const inReview = res?.inReview === true;
    if (isCorrect) correct++;
    else if (inReview) unmarked++;
    else incorrect++;

    results.push({
      index: i, prompt: q.question, given, correctAnswers: res?.correctAnswers ?? [],
      reasoning: res?.reasoning ?? '', result: res?.result ?? null, inReview, type: q.type,
      unit: q.extra || null, image: q.image || null, geminiFailed,
    });
  }

  log('[run] finished all questions, marking quiz complete...');
  
  if (!signal.cancelled) {
    try {
      await finishQuiz(session, attemptId);
      log('[run] Quiz marked as finished.');
    } catch (e) {
      warn('[run] Failed to finish quiz: ' + e.message);
    }
  }

  return {
    quizTitle: quizTitle || attempt.name || 'Educake quiz',
    total, correct, incorrect, unmarked, noAnswer,
    cancelled: !!signal.cancelled,
    durationSeconds: Math.floor((Date.now() - (session.startedAt ?? Date.now())) / 1000),
    results,
  };
}
