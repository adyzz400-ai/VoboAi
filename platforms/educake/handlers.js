// language: JavaScript (ESM), file: platforms/educake/handlers.js
import { EmbedBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import { log, warn } from '../../utils/logger.js';
import {
  getPlatform, setPlatform, patchPlatform, getTheme,
} from '../../hub/sessionStore.js';
import { buildPanel } from './panel.js';
import { buildEducakeLoginModal } from './loginModal.js';
import { buildTimingModal } from './timingModal.js';
import { buildEducakeSettingsModal } from './settingsModal.js';
import { buildVariantEmbed, buildVariantSelect } from './variantPicker.js';
import { educakeLogin } from './login.js';
import { listQuizzes, openAttempt } from './quizzes.js';
import { runAttempt } from './autocompleter.js';
import { buildSessionPdf } from './pdf.js';
import { renderScoreBar } from './progress.js';
import { queue } from '../../queue/index.js';
import { Task } from '../../queue/task.js';
import { config } from '../../utils/config.js';
import { jwtExpiryMs } from './auth.js';

function accentFor(userId) {
  const hex = getTheme(userId);
  const clean = hex.replace('#', '');
  return parseInt(clean, 16);
}

function panelEdit(interaction, result) {
  const payload = { embeds: [result.embed], components: result.components };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.update(payload);
}

async function refreshPanel(interaction) {
  const result = await buildPanel({ interaction: interaction });
  await panelEdit(interaction, result);
}

function validWaits(min, max) {
  if (!Number.isFinite(min)) return false;
  if (!Number.isFinite(max)) return false;
  if (min < 1) return false;
  if (max < 1) return false;
  if (max > 200) return false;
  if (min > max) return false;
  return true;
}

async function askLogin(interaction) {
  const accent = accentFor(interaction.user.id);
  const embeds = [buildVariantEmbed(accent)];
  const components = [buildVariantSelect()];
  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: embeds,
    components: components,
  });
}

async function chooseVariant(interaction) {
  const choice = interaction.values[0];
  if (choice === 'educake') {
    return interaction.showModal(buildEducakeLoginModal());
  }
  let label = 'Google';
  if (choice === 'educake-ms') label = 'Microsoft';
  const text = '**' + label + ' login** is coming soon.';
  const embed = new EmbedBuilder()
    .setColor(0xEAB308)
    .setAuthor({ name: 'Vobo AI · Educake' })
    .setDescription(text);
  return interaction.update({ embeds: [embed], components: [] });
}

async function makeStatusFn(interaction, accent) {
  return async function status(line) {
    const embed = new EmbedBuilder()
      .setColor(accent)
      .setAuthor({ name: 'Vobo AI · Educake' })
      .setDescription('Logging in — updates live.')
      .addFields({ name: 'Status', value: line });
    try {
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      // interaction may have expired
    }
  };
}

async function submitLogin(interaction) {
  const username = interaction.fields.getTextInputValue('username').trim();
  const password = interaction.fields.getTextInputValue('password');
  const accent = accentFor(interaction.user.id);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const status = await makeStatusFn(interaction, accent);
  await status('queued');

  const task = new Task({
    userId: interaction.user.id,
    kind: 'login',
    timeoutMs: 5 * 60 * 1000,
    run: async function () {
      await runLoginTask(interaction, username, password, status);
    },
  });
  queue.enqueue(task);
}

async function runLoginTask(interaction, username, password, status) {
  const userId = interaction.user.id;
  let session;
  try {
    session = await educakeLogin({
      username: username,
      password: password,
      onStatus: status,
    });
  } catch (err) {
    log('[educake] login error: ' + err.message);
    const fail = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: 'Vobo AI · Educake' })
      .setDescription('❌ Login failed: ' + err.message);
    await interaction.editReply({ embeds: [fail] }).catch(function () {});
    return;
  }

  setPlatform(userId, 'educake', {
    username: username,
    password: password,
    browser: session.browser,
    page: session.page,
    jwt: session.jwt,
    xsrf: session.xsrf,
    jwtExpUnix: Math.floor((jwtExpiryMs(session.jwt) ?? Date.now()) / 1000),
    baseUrl: session.baseUrl,
    waits: { min: config.waits.min, max: config.waits.max },
    includeImages: true,
    model: null,
    selectedAttemptId: null,
    quizzes: null,
    startedAt: Date.now(),
  });

  await status('fetching quiz list');
  try {
    const list = await listQuizzes(getPlatform(userId, 'educake'));
    patchPlatform(userId, 'educake', { quizzes: list.quizzes });
  } catch (err) {
    warn('[educake] quiz list failed: ' + err.message);
  }

  const panel = await buildPanel({ interaction: interaction });
  await interaction.editReply({
    embeds: [panel.embed],
    components: panel.components,
  }).catch(function () {});
}

async function setTiming(interaction) {
  const session = getPlatform(interaction.user.id, 'educake');
  return interaction.showModal(buildTimingModal(session));
}

async function submitTiming(interaction) {
  const min = Number(interaction.fields.getTextInputValue('min'));
  const max = Number(interaction.fields.getTextInputValue('max'));
  if (!validWaits(min, max)) {
    const bad = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: 'Vobo AI · Educake' })
      .setDescription('Invalid wait. Min ≥ 1, Max ≤ 200.');
    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [bad] });
  }
  patchPlatform(interaction.user.id, 'educake', { waits: { min: min, max: max } });
  await interaction.deferUpdate();
  await refreshPanel(interaction);
}

async function openSettings(interaction) {
  const session = getPlatform(interaction.user.id, 'educake');
  return interaction.showModal(buildEducakeSettingsModal(session));
}

async function submitSettings(interaction) {
  const min = Number(interaction.fields.getTextInputValue('min'));
  const max = Number(interaction.fields.getTextInputValue('max'));
  const img = interaction.fields.getTextInputValue('includeImages');
  const includeImages = (img || 'yes').toLowerCase() !== 'no';
  const model = interaction.fields.getTextInputValue('model')?.trim() || null;
  if (!validWaits(min, max)) {
    const bad = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: 'Vobo AI · Educake' })
      .setDescription('Invalid wait. Min ≥ 1, Max ≤ 200.');
    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [bad] });
  }
  patchPlatform(interaction.user.id, 'educake', {
    waits: { min: min, max: max },
    includeImages: includeImages,
    model: model,
  });
  await interaction.deferUpdate();
  await refreshPanel(interaction);
}

async function pickQuiz(interaction) {
  const attemptId = Number(interaction.values[0]);
  patchPlatform(interaction.user.id, 'educake', { selectedAttemptId: attemptId });
  await interaction.deferUpdate();
  await refreshPanel(interaction);
}

async function startRun(interaction) {
  const userId = interaction.user.id;
  const session = getPlatform(userId, 'educake');
  const accent = accentFor(userId);

  if (!session) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Log in first.' });
  }
  if (!session.jwt) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Session expired.' });
  }
  if (!session.selectedAttemptId) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Pick a quiz first.' });
  }

  const ack = new EmbedBuilder()
    .setColor(accent)
    .setAuthor({ name: 'Vobo AI · Educake' })
    .setDescription('📥 Run queued.');
  await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [ack] });

  const eduState = getPlatform(userId, 'educake');
  const list = eduState.quizzes ?? [];
  const wanted = eduState.selectedAttemptId;
  let quizRow = null;
  for (const q of list) {
    if (q.attemptId === wanted) { quizRow = q; break; }
  }
  if (!quizRow) {
    return interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Quiz not found.' });
  }

  const signal = { cancelled: false };
  const waitEmbed = new EmbedBuilder()
    .setColor(accent)
    .setAuthor({ name: 'Vobo AI · Educake' })
    .setDescription('⏳ Waiting for queue slot…');
  const progressMsg = await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [waitEmbed],
  });

  const task = new Task({
    userId: userId,
    kind: 'run',
    timeoutMs: 30 * 60 * 1000,
    run: async function () {
      await runQuizTask(interaction, userId, session, quizRow, signal, progressMsg, accent);
    },
  });

  setPlatform(userId, 'educake', { ...eduState, activeSignal: signal });
  queue.enqueue(task);
}

async function runQuizTask(interaction, userId, session, quizRow, signal, progressMsg, accent) {
  const freshSession = { ...getPlatform(userId, 'educake'), startedAt: Date.now() };

  let opened;
  try {
    opened = await openAttempt(session, quizRow.attemptId);
  } catch (err) {
    warn('[run] openAttempt failed: ' + err.message);
    await progressMsg.edit({
      embeds: [new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription('❌ Could not open quiz: ' + err.message)],
    }).catch(function () {});
    return;
  }

  const attemptId = opened.attemptId;
  const attempt = opened.attempt;
  const editReply = function (opts) { return progressMsg.edit(opts); };
  const modelOverride = freshSession.model || undefined;

  const summary = await runAttempt({
    session: freshSession,
    attemptId: attemptId,
    attempt: {
      questions: attempt.questions,
      questionMap: attempt.questionMap,
      name: attempt.name,
    },
    interaction: { editReply: editReply, user: interaction.user },
    signal: signal,
    model: modelOverride,
    quizTitle: quizRow.title || attempt.name,
    userId: userId,
  });

  const pdf = await buildSessionPdf(summary);
  await sendSummaryDm(interaction, accent, summary, pdf);
}

async function sendSummaryDm(interaction, accent, summary, pdf) {
  let dm;
  try {
    dm = await interaction.user.createDM();
  } catch (err) {
    warn('[run] DM open failed: ' + err.message);
    return;
  }

  let pct = 0;
  if (summary.total > 0) {
    pct = Math.round((summary.correct / summary.total) * 100);
  }

  const breakdown = '✓ ' + summary.correct + '  ✗ ' + summary.incorrect
    + '  ? ' + summary.unmarked + '  ⚠ ' + summary.noAnswer;

  const embed = new EmbedBuilder()
    .setColor(accent)
    .setAuthor({ name: 'Vobo AI · session complete' })
    .addFields(
      { name: 'Quiz', value: summary.quizTitle },
      { name: 'Score', value: summary.correct + ' / ' + summary.total + ' · ' + pct + '%' },
      { name: 'Breakdown', value: breakdown },
    );

  try {
    const scoreBuf = await renderScoreBar(summary.correct, summary.total);
    const scoreFile = new AttachmentBuilder(scoreBuf, { name: 'score.png' });
    const pdfFile = new AttachmentBuilder(pdf, { name: 'session-summary.pdf' });
    await dm.send({ embeds: [embed], files: [scoreFile, pdfFile] });
  } catch (err) {
    warn('[run] DM send failed: ' + err.message);
  }
}

async function cancelRun(interaction) {
  const session = getPlatform(interaction.user.id, 'educake');
  if (session && session.activeSignal) {
    session.activeSignal.cancelled = true;
  }
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: 'Cancellation signalled.',
  });
}

export const eduHandlers = {
  'edu:login': askLogin,
  'edu:login:variant': chooseVariant,
  'edu:login:submit': submitLogin,
  'edu:timing': setTiming,
  'edu:timing:submit': submitTiming,
  'edu:settings': openSettings,
  'edu:settings:submit': submitSettings,
  'edu:quiz': pickQuiz,
  'edu:start': startRun,
  'edu:cancel': cancelRun,
};

queue.on('finish', function onFinish(task, err) {
  let errText = 'none';
  if (err) errText = err.message;
  log('[queue] finished ' + task.id + ' kind=' + task.kind + ' err=' + errText);
});