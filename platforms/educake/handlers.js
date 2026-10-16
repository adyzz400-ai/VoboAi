// language: JavaScript (ESM), file: platforms/educake/handlers.js
import { EmbedBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import { log, warn } from '../../utils/logger.js';
import { getPlatform, setPlatform, patchPlatform } from '../../hub/sessionStore.js';
import { buildPanel } from './panel.js';
import { buildEducakeLoginModal } from './loginModal.js';
import { buildTimingModal } from './timingModal.js';
import { buildEducakeSettingsModal } from './settingsModal.js';
import { buildVariantEmbed, buildVariantSelect } from './variantPicker.js';
import { educakeLogin } from './login.js';
import { listQuizzes, startQuiz } from './quizzes.js';
import { runAttempt } from './autocompleter.js';
import { buildSessionPdf } from './pdf.js';
import { renderScoreBar } from './progress.js';
import { queue } from '../../queue/index.js';
import { Task } from '../../queue/task.js';
import { config } from '../../utils/config.js';
import { jwtExpiryMs } from './auth.js';

const ACCENT = parseInt(config.accent.replace('#', ''), 16);

async function refreshPanel(interaction) {
  const { embed, components } = await buildPanel({ interaction });
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.update({ embeds: [embed], components });
  }
}

// valid wait window: 1..200 inclusive
function validWaits(min, max) {
  return Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max >= 1 && max <= 200 && min <= max;
}

export const eduHandlers = {
  async 'edu:login'(interaction) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [buildVariantEmbed()],
      components: [buildVariantSelect()],
    });
  },

  async 'edu:login:variant'(interaction) {
    const choice = interaction.values[0];
    if (choice !== 'educake') {
      const label = choice === 'educake-ms' ? 'Microsoft' : 'Google';
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xEAB308).setAuthor({ name: 'Vobo AI · Educake' })
          .setDescription(`**${label} login** is coming soon.\nUse the Educake username option for now.`)],
        components: [],
      });
    }
    return interaction.showModal(buildEducakeLoginModal());
  },

  async 'edu:login:submit'(interaction) {
    const username = interaction.fields.getTextInputValue('username').trim();
    const password = interaction.fields.getTextInputValue('password');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const status = (line) => interaction.editReply({
      embeds: [new EmbedBuilder().setColor(ACCENT).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription('Logging in — this panel updates live.')
        .addFields({ name: 'Status', value: line })],
    }).catch(() => {});

    await status('queued');

    const task = new Task({
      userId: interaction.user.id, kind: 'login', timeoutMs: 5 * 60 * 1000,
      run: async () => {
        try {
          const session = await educakeLogin({ username, password, onStatus: status });
          setPlatform(interaction.user.id, 'educake', {
            username, password,
            browser: session.browser, page: session.page,
            jwt: session.jwt, xsrf: session.xsrf,
            jwtExpUnix: Math.floor((jwtExpiryMs(session.jwt) ?? Date.now()) / 1000),
            baseUrl: session.baseUrl,
            waits: { min: config.waits.min, max: config.waits.max },
            includeImages: true, model: null,
            selectedAttemptId: null, quizzes: null,
            startedAt: Date.now(),
          });
          await status('fetching quiz list');
          try {
            const { quizzes } = await listQuizzes(getPlatform(interaction.user.id, 'educake'));
            patchPlatform(interaction.user.id, 'educake', { quizzes });
          } catch (err) { warn(`[educake] quiz list failed: ${err.message}`); }

          await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x57F287).setAuthor({ name: 'Vobo AI · Educake' })
              .setDescription('✅ Login successful. Reopen the hub panel to pick a quiz.')],
          }).catch(() => {});
        } catch (err) {
          log(`[educake] login error: ${err.message}`);
          await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI · Educake' })
              .setDescription(`❌ Login failed: ${err.message}`)],
          }).catch(() => {});
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
          .setDescription('Invalid wait window. Min ≥ 1, Max ≤ 200, Min ≤ Max.')],
      });
    }
    patchPlatform(interaction.user.id, 'educake', { waits: { min, max } });
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
    patchPlatform(interaction.user.id, 'educake', { waits: { min, max }, includeImages, model });
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
    if (!session?.jwt || !session?.selectedAttemptId) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Log in and pick a quiz first.' });
    }

    // ephemeral ack + ephemeral progress message — no stacking on the panel
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder().setColor(ACCENT).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription('📥 Run queued. Live progress will appear here.')],
    });

    const signal = { cancelled: false };
    const eduState = getPlatform(userId, 'educake');
    const quizRow = (eduState.quizzes ?? []).find(q => q.attemptId === eduState.selectedAttemptId);

    const progressMsg = await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder().setColor(ACCENT).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription('⏳ Waiting for queue slot…')],
    });

    const task = new Task({
      userId, kind: 'run', timeoutMs: 30 * 60 * 1000,
      run: async () => {
        const { attemptId, attempt } = await startQuiz(session, quizRow.assessmentId);

        const summary = await runAttempt({
          session: { ...getPlatform(userId, 'educake'), startedAt: Date.now() },
          attemptId,
          attempt: { questions: attempt.questions, questionMap: attempt.questionMap, name: attempt.name },
          interaction: { editReply: (opts) => progressMsg.edit(opts), user: interaction.user },
          signal,
          model: eduState.model || undefined,
          quizTitle: quizRow?.title ?? attempt.name,
        });

        const pdf = await buildSessionPdf(summary);
        try {
          const dm = await interaction.user.createDM();
          await dm.send({
            embeds: [new EmbedBuilder().setColor(ACCENT).setAuthor({ name: 'Vobo AI · session complete' })
              .addFields(
                { name: 'Quiz', value: summary.quizTitle },
                { name: 'Score', value: `${summary.correct} / ${summary.total}  ·  ${summary.total ? Math.round((summary.correct / summary.total) * 100) : 0}%` },
                { name: 'Breakdown', value: `✓ ${summary.correct} correct   ✗ ${summary.incorrect} incorrect   ? ${summary.unmarked} unmarked   ⚠ ${summary.noAnswer} no AI answer` },
              )],
            files: [
              new AttachmentBuilder(await renderScoreBar(summary.correct, summary.total), { name: 'score.png' }),
              new AttachmentBuilder(pdf, { name: 'session-summary.pdf' }),
            ],
          });
        } catch (err) { warn(`[run] DM failed: ${err.message}`); }
      },
    });

    setPlatform(userId, 'educake', { ...eduState, activeSignal: signal });
    queue.enqueue(task);
  },

  async 'edu:cancel'(interaction) {
    const session = getPlatform(interaction.user.id, 'educake');
    if (session?.activeSignal) session.activeSignal.cancelled = true;
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Cancellation signalled.' });
  },
};

queue.on('finish', (task, err) => {
  log(`[queue] finished ${task.id} kind=${task.kind} err=${err ? err.message : 'none'}`);
});