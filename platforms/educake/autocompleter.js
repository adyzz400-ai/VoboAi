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
    { name: 'Current', value: (opts.q?.prompt || '—').slice(0, 280) || '—' }
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

  const hex = getTheme(userId);
  const accent = parseInt(hex.replace('#', ''), 16);

  const map = attempt.questionMap || {};
  const order = attempt.questions.map(String).filter(id => map[id] && !map[id].answer);
  const total = order.length;
  
  if (total === 0) {
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
      choices: q.type === 'multiple' ? (q.choices || []) : null,
      unit: q.extra || null,
      image: q.image || null,
    };

    log('[run] Q' + (i+1) + '/' + total + ' asking Gemini...');
    const embed = buildProgressEmbed(accent, { 
      quizTitle, index: i, total, q: normQ, correct, incorrect, status: 'asking AI…' 
    });
    
    const barBuf = await renderEducakeProgress(i, total, correct, incorrect);
    const progressFile = new AttachmentBuilder(barBuf, { name: 'progress.png' });

    const askPayload = {
      embeds: [embed],
      files: [progressFile],
      components: [runningButtons()]
    };

    await interaction.editReply(askPayload).catch(function() {});

    let geminiResp = null;
    let geminiFailed = false;
    
    try { 
      geminiResp = await getAIanswer(normQ, session, { model: model }); 
    } catch (err) { 
      geminiFailed = true; 
    }
    
    if (!geminiResp || !geminiResp.answer) geminiFailed = true;

    if (geminiFailed) {
      log('[run] AI failed or rate limited. Aborting loop to prevent bad answers.');
      noAnswer += (total - i); 
      
      const errEmbed = new EmbedBuilder();
      errEmbed.setColor(0xED4245);
      errEmbed.setAuthor({ name: 'Vobo AI · halted' });
      errEmbed.setDescription('❌ **Gemini API rate limit reached.**\nGoogle is limiting requests. Please wait 60 seconds and press Start again.\n\nNo bad answers were submitted.');
      
      const errPayload = { embeds: [errEmbed], components: [] };
      await interaction.editReply(errPayload).catch(function() {});
      break; 
    }

    let given = coerceGivenAnswer(normQ, geminiResp.answer);
    if (!given) {
      given = geminiResp.answer; 
    }

    let minSec = Number(session.waits?.min || config.waits.min);
    let maxSec = Number(session.waits?.max || config.waits.max);
    
    if (minSec < 8) minSec = 8;
    if (maxSec < 15) maxSec = 15;

    const minMs = minSec * 1000;
    const maxMs = maxSec * 1000;
    const waitMs = minMs + Math.floor(Math.random() * Math.max(0, maxMs - minMs));
    const waitUntilUnix = Math.floor((Date.now() + waitMs) / 1000);

    log('[run] Q' + (i+1) + ' waiting ' + Math.round(waitMs/1000) + 's');
    const waitEmbed = buildProgressEmbed(accent, { 
      quizTitle, index: i, total, q: normQ, waitUntilUnix, correct, incorrect, status: 'waiting before submit…' 
    });

    const waitPayload = {
      embeds: [waitEmbed],
      files: [progressFile],
      components: [runningButtons()]
    };

    await interaction.editReply(waitPayload).catch(function() {});

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
        attemptId: attemptId,
        testQuestionId: q.testQuestionId,
        variantId: q.id,
        givenAnswer: given,
      });
    } catch (err) { 
      warn('[run] Q' + (i + 1) + ' submit failed: ' + err.message); 
    }

    const isCorrect = res && res.result === true;
    const inReview = res && res.inReview === true;
    if (isCorrect) correct++;
    else if (inReview) unmarked++;
    else incorrect++;

    results.push({
      index: i, prompt: q.question, given: given, correctAnswers: (res && res.correctAnswers) || [],
      reasoning: (res && res.reasoning) || '', result: (res && res.result) || null, inReview: inReview, type: q.type,
      unit: q.extra || null, image: q.image || null, geminiFailed: geminiFailed,
    });
  }

  if (!signal.cancelled && noAnswer === 0) {
    try {
      await finishQuiz(session, attemptId);
    } catch (e) {}
  }

  return {
    quizTitle: quizTitle || attempt.name || 'Educake quiz',
    total: total, correct: correct, incorrect: incorrect, unmarked: unmarked, noAnswer: noAnswer,
    cancelled: !!signal.cancelled,
    durationSeconds: Math.floor((Date.now() - (session.startedAt || Date.now())) / 1000),
    results: results,
  };
}
