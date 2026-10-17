// language: JavaScript (ESM), file: platforms/educake/handlers.js
import { EmbedBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import { log, warn } from '../../utils/logger.js';
import { getPlatform, setPlatform, patchPlatform, getTheme } from '../../hub/sessionStore.js';
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
  return parseInt(hex.replace('#', ''), 16);
}

async function replyEphemeral(interaction, result) {
  const payload = { 
    embeds: [result.embed], 
    components: result.components, 
    flags: MessageFlags.Ephemeral 
  };
  
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
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

export const eduHandlers = {
  async 'edu:login'(interaction) {
    const accent = accentFor(interaction.user.id);
    const embed = buildVariantEmbed(accent);
    const select = buildVariantSelect();
    const payload = { flags: MessageFlags.Ephemeral, embeds: [embed], components: [select] };
    return interaction.reply(payload);
  },

  async 'edu:login:variant'(interaction) {
    const choice = interaction.values[0];
    if (choice !== 'educake') {
      let label = 'Google';
      if (choice === 'educake-ms') label = 'Microsoft';
      const embed = new EmbedBuilder();
      embed.setColor(0xEAB308);
      embed.setAuthor({ name: 'Vobo AI · Educake' });
      embed.setDescription('**' + label + ' login** is coming soon. Use Educake username for now.');
      const payload = { embeds: [embed], components: [] };
      return interaction.update(payload);
    }
    return interaction.showModal(buildEducakeLoginModal());
  },

  async 'edu:login:submit'(interaction) {
    const username = interaction.fields.getTextInputValue('username').trim();
    const password = interaction.fields.getTextInputValue('password');
    const accent = accentFor(interaction.user.id);

    const deferPayload = { flags: MessageFlags.Ephemeral };
    await interaction.deferReply(deferPayload);

    const status = async function (line) {
      const embed = new EmbedBuilder();
      embed.setColor(accent);
      embed.setAuthor({ name: 'Vobo AI · Educake' });
      embed.setDescription('Logging in — this panel updates live.');
      embed.addFields({ name: 'Status', value: line });
      const payload = { embeds: [embed] };
      await interaction.editReply(payload).catch(function () {});
    };

    await status('queued');

    const task = new Task({
      userId: interaction.user.id,
      kind: 'login',
      timeoutMs: 5 * 60 * 1000,
      run: async function () {
        try {
          const session = await educakeLogin({ username: username, password: password, onStatus: status });
          const newSession = {
            username: username, password: password, browser: session.browser, page: session.page,
            jwt: session.jwt, xsrf: session.xsrf, jwtExpUnix: Math.floor((jwtExpiryMs(session.jwt) ?? Date.now()) / 1000),
            baseUrl: session.baseUrl, waits: { min: config.waits.min, max: config.waits.max },
            includeImages: true, model: null, selectedAttemptId: null, quizzes: null, startedAt: Date.now()
          };
          setPlatform(interaction.user.id, 'educake', newSession);

          await status('fetching quiz list');
          try {
            const result = await listQuizzes(getPlatform(interaction.user.id, 'educake'));
            const patch = { quizzes: result.quizzes };
            patchPlatform(interaction.user.id, 'educake', patch);
          } catch (err) {
            warn('[educake] quiz list failed: ' + err.message);
          }

          const panel = await buildPanel({ interaction: interaction });
          await replyEphemeral(interaction, panel);
        } catch (err) {
          log('[educake] login error: ' + err.message);
          const embed = new EmbedBuilder();
          embed.setColor(0xED4245);
          embed.setAuthor({ name: 'Vobo AI · Educake' });
          embed.setDescription('❌ Login failed: ' + err.message);
          const payload = { embeds: [embed] };
          await interaction.editReply(payload).catch(function () {});
        }
      },
    });

    queue.enqueue(task);
  },

  async 'edu:timing'(interaction) {
    const session = getPlatform(interaction.user.id, 'educake');
    return interaction.showModal(buildTimingModal(session));
  },

  async 'edu:timing:submit'(interaction) {
    const min = Number(interaction.fields.getTextInputValue('min'));
    const max = Number(interaction.fields.getTextInputValue('max'));
    if (!validWaits(min, max)) {
      const embed = new EmbedBuilder();
      embed.setColor(0xED4245);
      embed.setAuthor({ name: 'Vobo AI · Educake' });
      embed.setDescription('Invalid wait window. Min ≥ 1, Max ≤ 200, Min ≤ Max.');
      const payload = { flags: MessageFlags.Ephemeral, embeds: [embed] };
      return interaction.reply(payload);
    }
    const patch = { waits: { min: min, max: max } };
    patchPlatform(interaction.user.id, 'educake', patch);
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },

  async 'edu:settings'(interaction) {
    const session = getPlatform(interaction.user.id, 'educake');
    return interaction.showModal(buildEducakeSettingsModal(session));
  },

  async 'edu:settings:submit'(interaction) {
    const min = Number(interaction.fields.getTextInputValue('min'));
    const max = Number(interaction.fields.getTextInputValue('max'));
    const includeImages = (interaction.fields.getTextInputValue('includeImages') || 'yes').toLowerCase() !== 'no';
    const model = interaction.fields.getTextInputValue('model')?.trim() || null;
    if (!validWaits(min, max)) {
      const embed = new EmbedBuilder();
      embed.setColor(0xED4245);
      embed.setAuthor({ name: 'Vobo AI · Educake' });
      embed.setDescription('Invalid wait window. Min ≥ 1, Max ≤ 200, Min ≤ Max.');
      const payload = { flags: MessageFlags.Ephemeral, embeds: [embed] };
      return interaction.reply(payload);
    }
    const patch = { waits: { min: min, max: max }, includeImages: includeImages, model: model };
    patchPlatform(interaction.user.id, 'educake', patch);
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },

  async 'edu:quiz'(interaction) {
    const attemptId = Number(interaction.values[0]);
    const patch = { selectedAttemptId: attemptId };
    patchPlatform(interaction.user.id, 'educake', patch);
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },

  async 'edu:start'(interaction) {
    // ... (start logic stays the same, DM is inherently private) ...
    const userId = interaction.user.id;
    const session = getPlatform(userId, 'educake');
    const accent = accentFor(userId);

    if (!session) {
      const payload = { flags: MessageFlags.Ephemeral, content: 'Log in first.' };
      return interaction.reply(payload);
    }
    if (!session.jwt) {
      const payload = { flags: MessageFlags.Ephemeral, content: 'Session expired — log in again.' };
      return interaction.reply(payload);
    }
    if (!session.selectedAttemptId) {
      const payload = { flags: MessageFlags.Ephemeral, content: 'Pick a quiz from the dropdown first.' };
      return interaction.reply(payload);
    }

    const eduState = getPlatform(userId, 'educake');
    let quizzesList = [];
    if (eduState.quizzes) {
      quizzesList = eduState.quizzes;
    }
    const quizRow = quizzesList.find(function(q) { return q.attemptId === eduState.selectedAttemptId; });

    if (!quizRow) {
      const payload = { flags: MessageFlags.Ephemeral, content: 'Selected quiz not found in session.' };
      return interaction.reply(payload);
    }

    const ackEmbed = new EmbedBuilder();
    ackEmbed.setColor(accent);
    ackEmbed.setAuthor({ name: 'Vobo AI · Educake' });
    ackEmbed.setDescription('📥 Opening DM. Progress will stream there.');
    const ackPayload = { flags: MessageFlags.Ephemeral, embeds: [ackEmbed] };
    await interaction.reply(ackPayload);

    let dmChannel;
    let progressMsg;
    try {
      dmChannel = await interaction.user.createDM();
      const dmEmbed = new EmbedBuilder();
      dmEmbed.setColor(accent);
      dmEmbed.setAuthor({ name: 'Vobo AI · Educake' });
      dmEmbed.setDescription('⏳ Waiting for queue slot…');
      const dmPayload = { embeds: [dmEmbed] };
      progressMsg = await dmChannel.send(dmPayload);
    } catch (err) {
      warn('[run] could not open DM: ' + err.message);
      const payload = { content: 'Could not open DMs. Please check your privacy settings.' };
      return interaction.editReply(payload);
    }

    const signal = { cancelled: false };

    const task = new Task({
      userId: userId,
      kind: 'run',
      timeoutMs: 30 * 60 * 1000,
      run: async function () {
        try {
          const opened = await openAttempt(session, quizRow.attemptId);
          
          const runSession = getPlatform(userId, 'educake');
          runSession.startedAt = Date.now();
          
          const runAttemptPayload = {
            session: runSession,
            attemptId: opened.attemptId,
            attempt: { questions: opened.attempt.questions, questionMap: opened.attempt.questionMap, name: opened.attempt.name },
            interaction: { editReply: function (opts) { return progressMsg.edit(opts); }, user: interaction.user },
            signal: signal,
            model: eduState.model || undefined,
            quizTitle: quizRow.title || opened.attempt.name,
            userId: userId
          };
          
          const summary = await runAttempt(runAttemptPayload);

          const pdf = await buildSessionPdf(summary);
          
          const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0;
          const breakdown = '✓ ' + summary.correct + ' correct   ✗ ' + summary.incorrect +
            ' incorrect   ? ' + summary.unmarked + ' unmarked   ⚠ ' + summary.noAnswer + ' no AI answer';
          
          const finalEmbed = new EmbedBuilder();
          finalEmbed.setColor(accent);
          finalEmbed.setAuthor({ name: 'Vobo AI · session complete' });
          finalEmbed.addFields(
            { name: 'Quiz', value: summary.quizTitle },
            { name: 'Score', value: summary.correct + ' / ' + summary.total + '  ·  ' + pct + '%' },
            { name: 'Breakdown', value: breakdown }
          );

          const scoreBuf = await renderScoreBar(summary.correct, summary.total);
          const finalPayload = {
            embeds: [finalEmbed],
            files: [new AttachmentBuilder(scoreBuf, { name: 'score.png' }), new AttachmentBuilder(pdf, { name: 'session-summary.pdf' })]
          };
          
          await progressMsg.edit(finalPayload);
        } catch (e) {
          log('[run] FATAL: ' + e.message);
          const errEmbed = new EmbedBuilder();
          errEmbed.setColor(0xED4245);
          errEmbed.setAuthor({ name: 'Vobo AI · Educake' });
          errEmbed.setDescription('Run failed: ' + e.message);
          const errPayload = { embeds: [errEmbed] };
          await progressMsg.edit(errPayload).catch(function() {});
        }
      },
    });

    const currentState = getPlatform(userId, 'educake');
    currentState.activeSignal = signal;
    setPlatform(userId, 'educake', currentState);
    queue.enqueue(task);
  },

  async 'edu:cancel'(interaction) {
    const session = getPlatform(interaction.user.id, 'educake');
    if (session && session.activeSignal) {
      session.activeSignal.cancelled = true;
    }
    const payload = { flags: MessageFlags.Ephemeral, content: 'Cancellation signalled.' };
    await interaction.reply(payload);
  },
};

queue.on('finish', function onFinish(task, err) {
  let errText = 'none';
  if (err) errText = err.message;
  log('[queue] finished ' + task.id + ' kind=' + task.kind + ' err=' + errText);
});
