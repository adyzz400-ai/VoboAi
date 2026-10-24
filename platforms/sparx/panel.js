// language: JavaScript (ESM), file: platforms/sparx/panel.js
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlatform, getTheme } from '../../hub/sessionStore.js';

export function buildPanel({ interaction }) {
  const session = getPlatform(interaction.user.id, 'sparx');
  const accent = parseInt(getTheme(interaction.user.id).replace('#', ''), 16) || 0x0a78ff;

  const embed = new EmbedBuilder()
    .setColor(accent)
    .setAuthor({ name: 'Vobo AI · Sparx Maths' })
    .setDescription('**Welcome to Sparx Automation**\n\nSelect a homework below to start.');

  const components = [];

  // FIX: Check 'tasks' instead of 'homeworks' to match handlers.js
  if (session?.tasks && session.tasks.length > 0) {
    const hwSelect = new StringSelectMenuBuilder()
      // FIX: Use 'sparx:task' to match the handler in handlers.js
      .setCustomId('sparx:task')
      .setPlaceholder('Select homework...')
      .addOptions(session.tasks.map(hw => ({
        label: hw.title.length > 25 ? hw.title.slice(0, 22) + '...' : hw.title,
        value: hw.packageId,
        description: `Due ${hw.dueDate || hw.dueText || '—'} · ${hw.accuracy || '0%'} · ${hw.tasks?.length || 0} tasks`
      })));

    components.push(new ActionRowBuilder().addComponents(hwSelect));

    // FIX: Check 'selectedTaskId' instead of 'selectedHomework'
    if (session.selectedTaskId) {
      const selected = session.tasks.find(h => h.packageId === session.selectedTaskId);
      if (selected) {
        embed.addFields({
          name: 'Selected',
          value: `**${selected.title}**\nDue: ${selected.dueDate || selected.dueText || '—'}\nTasks: ${selected.tasks?.length || 0}\nAccuracy: ${selected.accuracy || '0%'}`,
          inline: false
        });

        const startRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('sparx:start').setLabel('Start Homework').setStyle(ButtonStyle.Success)
        );
        components.push(startRow);
      }
    }
  } else {
    embed.setDescription('**No homeworks found.**\n\nPlease login again.');
  }

  const settingsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sparx:timing').setLabel('⏱ Timing').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sparx:settings').setLabel('⚙ Settings').setStyle(ButtonStyle.Secondary)
  );
  components.push(settingsRow);

  return { embed, components };
}
