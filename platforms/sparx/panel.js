// language: JavaScript (ESM), file: platforms/sparx/panel.js
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getPlatform } from '../../hub/sessionStore.js';

export function buildPanel({ interaction }) {
  const session = getPlatform(interaction.user.id, 'sparx');
  const accent = parseInt(getTheme(interaction.user.id).replace('#', ''), 16) || 0x0a78ff;

  const embed = new EmbedBuilder()
    .setColor(accent)
    .setAuthor({ name: 'Vobo AI · Sparx Maths' })
    .setDescription('**Welcome to Sparx Automation**\n\nSelect a homework below to start.');

  const components = [];

  if (session?.homeworks && session.homeworks.length > 0) {
    const hwSelect = new StringSelectMenuBuilder()
      .setCustomId('sparx:homework')
      .setPlaceholder('Select homework...')
      .addOptions(session.homeworks.map(hw => ({
        label: hw.title.length > 25 ? hw.title.slice(0, 22) + '...' : hw.title,
        value: hw.packageId,
        description: `Due ${hw.dueText || '—'} · ${hw.accuracy || '0%'} · ${hw.totalTasks || 0} tasks`
      })));

    components.push(new ActionRowBuilder().addComponents(hwSelect));

    if (session.selectedHomework) {
      const selected = session.homeworks.find(h => h.packageId === session.selectedHomework);
      if (selected) {
        embed.addFields({
          name: 'Selected',
          value: `**${selected.title}**\nDue: ${selected.dueText || '—'}\nTasks: ${selected.totalTasks || 0}\nAccuracy: ${selected.accuracy || '0%'}`,
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
