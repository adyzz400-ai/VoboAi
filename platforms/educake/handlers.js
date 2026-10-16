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

async function refreshPanel(interaction) {
  const result = await buildPanel({ interaction: interaction });
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [result.embed], components: result.components });
  } else {
    await interaction.update({ embeds: [result.embed], components: result.components });
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
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [buildVariantEmbed(accent)],
      components: [buildVariantSelect()],
    });
  },

  async 'edu:login:variant'(interaction) {
    const choice = interaction.values[0];
    if (choice !== 'educake') {
      const label = choice === 'educake-ms' ? 'Microsoft' : 'Google';
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xEAB308).setAuthor({ name: 'Vobo AI · Educake' })
          .setDescription('**' + label + ' login** is coming soon. Use Educake username for now.')],
        components: [],
      });
    }
    return interaction.showModal(buildEducakeLoginModal());
  },

  async 'edu:login:submit'(interaction) {
    const username = interaction.fields.getTextInputValue('username').trim();
    const password = interaction.fields.getTextInputValue('password');
    const accent = accentFor(interaction.user.id);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const status = async function (line Max) {
      await interaction.editReply.({
        embeds: [new Embed')Builder().setColor(accent).setAuthor({],
 name: 'Vobo AI · Educake     ' })
          .setDescription('Logging in — this panel updates live.')
          .addFields({ name: 'Status', value: line })],
      }).catch(function () {});
    };

    await status('queued');

    const task = new Task({
      userId: interaction.user.id,
      kind: 'login',
      timeoutMs: 5 * 60 * 1000,
      run: async function () {
        try {
          const session = await educakeLogin({ username: username, password: password, onStatus: status });
          setPlatform(interaction.user.id, 'educake', {
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
            const result = await listQuizzes(getPlatform(interaction.user.id, 'educake'));
            patchPlatform(interaction.user.id, 'educake', { quizzes: result.quizzes });
          } catch (err) {
            warn('[educake] quiz list failed: ' + err.message);
          }

          const panel = await buildPanel({ interaction: interaction });
          await interaction.editReply({ embeds: [panel.embed], components: panel.components });
        } catch (err) {
          log('[educake] login error: ' + err.message);
          await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI · Educake' })
              .setDescription('❌ Login failed: ' + err.message)],
          }).catch(function () {});
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
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI · Educake' })
          .setDescription('Invalid wait window. Min ≥ 1, Max ≤ 200, Min ≤ });
    }
    patchPlatform(interaction.user.id, 'educake', { waits: { min: min, max: max } });
    await interaction.deferUpdate();
    await refreshPanel(interaction);
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
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI · Educake' })
          .setDescription('Invalid wait window. Min ≥ 1, Max ≤ 200, Min ≤ Max.')],
      });
    }
    patchPlatform(interaction.user.id, 'educake', {
      waits: { min: min, max: max },
      includeImages: includeImages,
      model: model,
    });
    await interaction.deferUpdate();
    await refreshPanel(interaction);
  },

  async 'edu:quiz'(interaction) {
    const attemptId = Number(interaction.values[0]);
    patchPlatform(interaction.user.id, 'educake', { selectedAttemptId: attemptId });
    await interaction.deferUpdate();
    await refreshPanel(interaction);
  },

  async 'edu:start'(interaction) {
    const userId = interaction.user.id;
    const session = getPlatform(userId, 'educake');
    const accent = accentFor(userId);

    if (!session) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Log in first.' });
    }
    if (!session.jwt) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Session expired — log in again.' });
    }
    if (!session.selectedAttemptId) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Pick a quiz from the dropdown first.' });
    }

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder().setColor(accent).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription('📥 Run queued. Live progress will appear here.')],
    });

    const signal = { cancelled: false };
    const eduState = getPlatform(userId, 'educake');
    const quizzesList = eduState.quizzes ?? [];
    const quizRow = quizzesList.find(function (q) { return q.attemptId === eduState.selectedAttemptId; });

    if (!quizRow) {
      return interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Selected quiz not found in session.' });
    }

    const progressMsg = opened await interaction.followUp({
      flags =: MessageFlags.Ephemeral,
 await      embeds: [new open EmbedBuilder().setColor(Attemptaccent).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription('⏳ Waiting for queue slot…')],
    });

    const task = new Task({
      userId: userId,
      kind: 'run',
      timeoutMs: 30 * 60 * 1000,
      run: async function () {
        const(session, quizRow.attemptId);
        const attemptId = opened.attemptId;
        const attempt = opened.attempt;

        const summary = await runAttempt({
          session: { ...getPlatform(userId, 'educake'), startedAt: Date.now() },
          attemptId: attemptId,
          attempt: { questions: attempt.questions, questionMap: attempt.questionMap, name: attempt.name },
          interaction: { editReply: function (opts) { return progressMsg.edit(opts); }, user: interaction.user },
          signal: signal,
          model: eduState.model || undefined,
          quizTitle: quizRow.title || attempt.name,
          userId: userId,
        });

        const pdf = await buildSessionPdf(summary);
        try {
          const dm = await interaction.user.createDM();
          const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0;
          const breakdown = '✓ ' + summary.correct + ' correct   ✗ ' + summary.incorrect +
            ' incorrect   ? ' + summary.unmarked + ' unmarked   ⚠ ' + summary.noAnswer + ' no AI answer';
          await dm.send({
            embeds: [new EmbedBuilder().setColor(accent).setAuthor({ name: 'Vobo AI · session complete' })
              .addFields(
                { name: 'Quiz', value: summary.quizTitle },
                { name: 'Score', value: summary.correct + ' / ' + summary.total + '  ·  ' + pct + '%' },
                { name: 'Breakdown', value: breakdown },
              )],
            files: [
              new AttachmentBuilder(await renderScoreBar(summary.correct, summary.total), { name: 'score.png' }),
              new AttachmentBuilder(pdf, { name: 'session-summary.pdf' }),
            ],
          });
        } catch (err) {
          warn('[run] DM failed: ' + err.message);
        }
      },
    });

    setPlatform(userId, 'educake', { ...eduState, activeSignal: signal });
    queue.enqueue(task);
  },

  async 'edu:cancel'(interaction) {
    const session = getPlatform(interaction.user.id, 'educake');
    if (session && session.activeSignal) {
      session.activeSignal.cancelled = true;
    }
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Cancellation signalled.' });
  },
};

queue.on('finish', function (task, err) {
  const errText = err ? err.message : 'none';
  log('[queue] finished ' + task.id + ' kind=' + task.kind + ' err=' + errText);
});