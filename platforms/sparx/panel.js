// language: JavaScript (ESM), file: platforms/sparx/panel.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getPlatform, getTheme } from '../../hub/sessionStore.js';

export function buildPanel({ interaction, loginVariant }) {
  const userId = interaction.user.id;
  const session = getPlatform(userId, 'sparx');
  const hex = getTheme(userId);
  const accent = parseInt(hex.replace('#', ''), 16) || 0x0a78ff;

  const isLoggedIn = !!session?.jwt || !!session?.isLoggedIn;
  const components = [];
  
  const embed = new EmbedBuilder()
    .setColor(accent)
    .setAuthor({ name: 'Vobo AI · Sparx Maths' });

  if (!isLoggedIn) {
    embed.setDescription('**Not logged in.**\n\nConnect your Sparx Maths account to load homework and start automating.');
    
    const loginBtn = new ButtonBuilder()
      .setCustomId('sparx:login')
      .setLabel('Login')
      .setStyle(ButtonStyle.Primary);
    
    components.push(new ActionRowBuilder().addComponents(loginBtn));
  } else {
    embed.setDescription('**Welcome to Sparx Automation**\n\nSelect a homework below to start.');
    
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
      embed.addFields({ name: 'Homework', value: 'No outstanding homework found.' });
    }

    const settingsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sparx:timing').setLabel('⏱ Timing').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sparx:settings').setLabel('⚙ Settings').setStyle(ButtonStyle.Secondary)
    );
    components.push(settingsRow);
  }

  return { embed, components };
}
