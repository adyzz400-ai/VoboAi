// language: JavaScript (ESM), file: platforms/educake/handlers.js
// *All edu:* button/select/modal routing. Wires login, timing, settings, quiz pick, run start, cancel.*
import { EmbedBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import { log, warn } from '../../utils/logger.js';
import { getPlatform, setPlatform, patchPlatform } from '../../hub/sessionStore.js';
import { buildPanel } from './panel.js';
import { buildEducakeLoginModal } from './loginModal.js';
import { buildTimingModal } from './timingModal.js';
import { buildEducakeSettingsModal } from './settingsModal.js';
import { educakeLogin, refreshEducakeSession } from './login.js';
import { listQuizzes, startQuiz } from './quizzes.js';
import { normalizeAttempt } from './parser.js';
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

export const eduHandlers = {
  async 'edu:login'(interaction) {
    return interaction.showModal(buildEducakeLoginModal());
  },

  async 'edu:login:submit'(interaction) {
    const username = interaction.fields.getTextInputValue('username').trim();
    const password = interaction.fields.getTextInputValue('password');
    await interaction.deferUpdate();

    const task = new Task({
      userId: interaction.user.id,
      kind: 'login',
      timeoutMs: 5 * 60 * 1000,
      run: async () => {
        const session = await educakeLogin({ username, password });
        setPlatform(interaction.user.id, 'educake', {
          username, password,              // cached for silent refresh; in-memory only
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

        // immediate quiz list
        try {
          const { quizzes } = await listQuizzes(getPlatform(interaction.user.id, 'educake'));
          patchPlatform(interaction.user.id, 'educake', { quizzes });
        } catch (err) {
          warn(`[educake] quiz list failed: ${err.message}`);
        }
        await refreshPanel(interaction);
      },
    });

    queue.enqueue(task);

    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(ACCENT).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription('Login queued. This panel will update when the browser is ready.')],
    }).catch(() => {});
  },

  async 'edu:timing'(interaction) {
    const session = getPlatform(interaction.user.id, 'educake');
    return interaction.showModal(buildTimingModal(session));
  },

  async 'edu:timing:submit'(interaction) {
    const min = Number(interaction.fields.getTextInputValue('min'));
    const max = Number(interaction.fields.getTextInputValue('max'));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
      return interaction.reply({ content: 'Invalid wait window.', flags: MessageFlags.Ephemeral });
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
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
      return interaction.reply({ content: 'Invalid wait window.', flags: MessageFlags.Ephemeral });
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
      return interaction.reply({ content: 'Log in and pick a quiz first.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferUpdate();

    const signal = { cancelled: false };
    const eduState = getPlatform(userId, 'educake');
    const quizRow = (eduState.quizzes ?? []).find(q => q.attemptId === eduState.selectedAttemptId);

    const task = new Task({
      userId,
      kind: 'run',
      timeoutMs: 30 * 60 * 1000,
      run: async () => {
        // 1) Start the attempt, get full question set back
        const { attemptId, attempt } = await startQuiz(session, quizRow.assessmentId);
        const normAttempt = normalizeAttempt(attempt);

        // 2) Run the loop
        const summary = await runAttempt({
          session: { ...getPlatform(userId, 'educake'), startedAt: Date.now() },
          attemptId,
          attempt: { questions: attempt.questions, questionMap: attempt.questionMap, name: attempt.name },
          interaction,
          signal,
          model: eduState.model || undefined,
          quizTitle: quizRow?.title ?? attempt.name,
        });

        // 3) PDF + DM
        const pdf = await buildSessionPdf(summary);
        try {
          const dm = await interaction.user.createDM();
          await dm.send({
            embeds: [new EmbedBuilder().setColor(ACCENT).setAuthor({ name: 'Vobo AI · session complete' })
              .addFields(
                { name: 'Quiz', value: summary.quizTitle },
                { name: 'Score', value: `${summary.correct} / ${summary.total}  ·  ${summary.total ? Math.round((summary.correct / summary.total) * 100) : 0}%` },
                { name: 'Breakdown', value: `✓ ${summary.correct} correct   ✗ ${summary.incorrect} incorrect   ? ${summary.unmarked} unmarked` },
              )],
            files: [new AttachmentBuilder(await renderScoreBar(summary.correct, summary.total), { name: 'score.png' }),
                    new AttachmentBuilder(pdf, { name: 'session-summary.pdf' })],
          });
        } catch (err) { warn(`[run] DM failed: ${err.message}`); }
      },
      onStart: async () => {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(ACCENT).setAuthor({ name: 'Vobo AI · Educake' })
            .setDescription('Run started. Progress updates appear here.')],
        }).catch(() => {});
      },
    });

    // track the signal so edu:cancel can flip it
    setPlatform(userId, 'educake', { ...eduState, activeSignal: signal });
    queue.enqueue(task);

    // small status edit while we queue
    const size = queue.size();
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(ACCENT).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription(`Queued · running ${size.running} · waiting ${size.waiting}`)],
    }).catch(() => {});
  },

  async 'edu:cancel'(interaction) {
    const session = getPlatform(interaction.user.id, 'educake');
    if (session?.activeSignal) session.activeSignal.cancelled = true;
    await interaction.reply({ content: 'Cancellation signalled.', flags: MessageFlags.Ephemeral });
  },
};

// — queue lifecycle → try to keep the UI honest when tasks finish or fail
queue.on('finish', async (task, err) => {
  log(`[queue] finished ${task.id} kind=${task.kind} err=${err ? err.message : 'none'}`);
});

// — silent refresh on 401 — wired by clients via session.onAuthFail set at login time.
export function attachRefresh(session, userId) {
  session.onAuthFail = async () => {
    const fresh = await refreshEducakeSession(session);
    patchPlatform(userId, 'educake', {
      browser: fresh.browser, page: fresh.page, jwt: fresh.jwt, xsrf: fresh.xsrf,
      jwtExpUnix: Math.floor((jwtExpiryMs(fresh.jwt) ?? Date.now()) / 1000),
    });
  };
}
