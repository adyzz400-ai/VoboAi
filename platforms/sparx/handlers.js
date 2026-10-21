// language: JavaScript (ESM), file: platforms/sparx/handlers.js
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { log, warn } from '../../utils/logger.js';
import { getPlatform, setPlatform, patchPlatform, getTheme } from '../../hub/sessionStore.js';
import { buildPanel } from './panel.js';
import { buildSparxVariantEmbed, buildSparxVariantSelect } from './variantPicker.js';
import { buildSparxLoginModal } from './loginModal.js';
import { buildSparxTimingModal } from './timingModal.js';
import { buildSparxSettingsModal } from './settingsModal.js';
import { sparxLogin } from './login.js';
import { runSparxPackage } from './autocompleter.js';
import { queue } from '../../queue/index.js';
import { Task } from '../../queue/task.js';
import { config } from '../../utils/config.js';
import { SparxClient } from './client.js';
import { parseHomeworkList, parseGetPackage } from './parser.js';

function accentFor(userId) {
  return parseInt(getTheme(userId).replace('#', ''), 16) || 0x0a78ff;
}

export const sparxHandlers = {
  async 'sparx:login'(interaction) {
    const accent = accentFor(interaction.user.id);
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [buildSparxVariantEmbed(accent)],
      components: [buildSparxVariantSelect()]
    });
  },

  async 'sparx:login:variant'(interaction) {
    const choice = interaction.values[0];
    if (choice !== 'sparx') {
      const embed = new EmbedBuilder().setColor(0xeab308).setDescription('**Social login** is coming soon. Use Sparx username for now.');
      return interaction.update({ embeds: [embed], components: [] });
    }
    return interaction.showModal(buildSparxLoginModal());
  },

  async 'sparx:login:submit'(interaction) {
    const school = interaction.fields.getTextInputValue('school').trim();
    const username = interaction.fields.getTextInputValue('username').trim();
    const password = interaction.fields.getTextInputValue('password');
    const accent = accentFor(interaction.user.id);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const status = async function (line) {
      const embed = new EmbedBuilder().setColor(accent).setAuthor({ name: 'Vobo AI · Sparx' }).setDescription('Logging in — this panel updates live.').addFields({ name: 'Status', value: line });
      await interaction.editReply({ embeds: [embed] }).catch(() => {});
    };

    await status('queued');

    const task = new Task({
      userId: interaction.user.id,
      kind: 'login',
      timeoutMs: 5 * 60 * 1000,
      run: async function () {
        try {
          const session = await sparxLogin({ school, username, password, onStatus: status });

          setPlatform(interaction.user.id, 'sparx', {
            username, password, school,
            jwt: session.jwt,
            sessionId: session.sessionId,
            cookie: session.cookie,
            browser: session.browser,
            page: session.page,
            jwtExpUnix: Math.floor(Date.now() / 1000) + 3600,
            waits: { min: config.waits.min, max: config.waits.max },
            selectedTaskId: null,
            tasks: null,
            startedAt: Date.now()
          });

          await status('fetching tasks');
          try {
            const client = new SparxClient(session);
            const listBuffer = await client.getHomeworkList();

            if (!listBuffer || !Buffer.isBuffer(listBuffer)) {
              warn('[sparx] ListStudentPackages returned non-buffer');
              patchPlatform(interaction.user.id, 'sparx', { tasks: [] });
            } else {
              log('[sparx] list buffer bytes=' + listBuffer.length);
              const baseList = parseHomeworkList(listBuffer);

              const homeworkList = [];
              let totalTasks = 0;

              for (const pkg of baseList) {
                try {
                  const pkgBuffer = await client.getPackage(pkg.packageId);
                  const detailed = parseGetPackage(pkgBuffer);
                  if (detailed) {
                    pkg.tasks = detailed.tasks || [];
                    pkg.dueDate = detailed.dueDate || pkg.dueDate;
                    pkg.title = detailed.title || pkg.title;
                    pkg.accuracy = detailed.accuracy || pkg.accuracy;
                  }
                } catch (err) {
                  warn(`[sparx] GetPackage ${pkg.packageId} failed: ${err.message}`);
                }
                totalTasks += pkg.tasks.length;
                homeworkList.push(pkg);
              }

              log('[sparx] packages=' + homeworkList.length + ' tasks=' + totalTasks);
              patchPlatform(interaction.user.id, 'sparx', { tasks: homeworkList });
            }
          } catch (err) {
            warn('[sparx] task list failed: ' + err.message);
            patchPlatform(interaction.user.id, 'sparx', { tasks: [] });
          }

          const panel = await buildPanel({ interaction: interaction });
          await interaction.editReply({ embeds: [panel.embed], components: panel.components });
        } catch (err) {
          log('[sparx] login error: ' + err.message);
          const embed = new EmbedBuilder().setColor(0xed4245).setAuthor({ name: 'Vobo AI · Sparx' }).setDescription('❌ Login failed: ' + err.message);
          await interaction.editReply({ embeds: [embed] }).catch(() => {});
        }
      }
    });
    queue.enqueue(task);
  },

  async 'sparx:timing'(interaction) {
    return interaction.showModal(buildSparxTimingModal(getPlatform(interaction.user.id, 'sparx')));
  },

  async 'sparx:timing:submit'(interaction) {
    const min = Number(interaction.fields.getTextInputValue('min'));
    const max = Number(interaction.fields.getTextInputValue('max'));
    if (min < 1 || max < 1 || max > 200 || min > max) {
      const embed = new EmbedBuilder().setColor(0xed4245).setDescription('Invalid wait window.');
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
    }
    patchPlatform(interaction.user.id, 'sparx', { waits: { min, max } });
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },

  async 'sparx:settings'(interaction) {
    return interaction.showModal(buildSparxSettingsModal(getPlatform(interaction.user.id, 'sparx')));
  },

  async 'sparx:settings:submit'(interaction) {
    const min = Number(interaction.fields.getTextInputValue('min'));
    const max = Number(interaction.fields.getTextInputValue('max'));
    const model = interaction.fields.getTextInputValue('model')?.trim() || null;

    if (min < 1 || max < 1 || max > 200 || min > max) {
      const embed = new EmbedBuilder().setColor(0xed4245).setDescription('Invalid wait window.');
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
    }

    patchPlatform(interaction.user.id, 'sparx', { waits: { min, max }, model: model });
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },

  async 'sparx:task'(interaction) {
    const taskId = interaction.values[0];
    patchPlatform(interaction.user.id, 'sparx', { selectedTaskId: taskId });
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },

  async 'sparx:start'(interaction) {
    const userId = interaction.user.id;
    const session = getPlatform(userId, 'sparx');
    const accent = accentFor(userId);

    if (!session?.jwt) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Session expired. Re-login.' });
    }
    if (!session.selectedTaskId) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Pick a homework from the dropdown first.' });
    }

    const homework = (session.tasks || []).find((t) => String(t.packageId) === String(session.selectedTaskId));
    if (!homework) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Selected homework not found.' });
    }

    const ackEmbed = new EmbedBuilder().setColor(accent).setAuthor({ name: 'Vobo AI · Sparx' }).setDescription('📥 Opening DM. Progress will stream there.');
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [ackEmbed] });

    let progressMsg;
    try {
      const dmChannel = await interaction.user.createDM();
      const dmEmbed = new EmbedBuilder().setColor(accent).setAuthor({ name: 'Vobo AI · Sparx' }).setDescription('⏳ Waiting for queue slot…');
      progressMsg = await dmChannel.send({ embeds: [dmEmbed] });
    } catch (err) {
      return interaction.editReply({ content: 'Could not open DMs.' });
    }

    const signal = { cancelled: false };
    const task = new Task({
      userId: userId,
      kind: 'run',
      timeoutMs: 60 * 60 * 1000,
      run: async function () {
        try {
          const summary = await runSparxPackage({
            session: session,
            packageId: homework.packageId,
            homework: homework,
            interaction: { editReply: (opts) => progressMsg.edit(opts) },
            signal: signal,
            onLog: (txt) => log('[sparx] ' + txt)
          });

          if (summary.success) {
            const finalEmbed = new EmbedBuilder().setColor(accent).setAuthor({ name: 'Vobo AI · Homework complete' }).setDescription('Finished all tasks in the homework!\nTotal correct: ' + summary.totalCorrect);
            await progressMsg.edit({ embeds: [finalEmbed] });
          } else {
            const failLines = (summary.failedTasks || []).map((t) => `• **${t.title}** — ${t.error}`).join('\n') || '• (no tasks ran)';
            const partialEmbed = new EmbedBuilder().setColor(0xed4245).setAuthor({ name: 'Vobo AI · Homework incomplete' }).setDescription(`Some tasks did not complete.\n**Correct so far**: ${summary.totalCorrect}\n**Questions completed**: ${summary.questionsCompleted}\n\n**Failures**\n${failLines}`);
            await progressMsg.edit({ embeds: [partialEmbed] });
          }
        } catch (e) {
          log('[sparx] FATAL: ' + e.message);
          const errEmbed = new EmbedBuilder().setColor(0xed4245).setDescription('Run failed: ' + e.message);
          await progressMsg.edit({ embeds: [errEmbed] }).catch(() => {});
        }
      }
    });

    const currentState = getPlatform(userId, 'sparx');
    currentState.activeSignal = signal;
    setPlatform(userId, 'sparx', currentState);
    queue.enqueue(task);
  }
};
