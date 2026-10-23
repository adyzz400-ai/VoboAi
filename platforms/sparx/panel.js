// language: JavaScript (ESM), file: platforms/sparx/panel.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getPlatform, getTheme } from '../../hub/sessionStore.js';

export function buildPanel({ interaction }) {
  const userId = interaction.user.id;
  const session = getPlatform(userId, 'sparx');
  const hex = getTheme(userId);
  const accent = parseInt(hex.replace('#', ''), 16) || 0x0a78ff;

  const isLoggedIn = !!session?.jwt;
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
    
    // Check BOTH keys to guarantee the dropdown renders regardless of session state
    const homeworkList = session?.tasks || session?.homeworks || [];
    
    if (homeworkList.length > 0) {
      const hwSelect = new StringSelectMenuBuilder()
        .setCustomId('sparx:task') // Must match the handler in handlers.js to prevent timeout
        .setPlaceholder('Select homework...')
        .addOptions(homeworkList.map(hw => {
          const title = hw.title || 'Homework';
          const taskCount = hw.tasks?.length || hw.totalTasks || 0;
          return {
            label: title.length > 25 ? title.slice(0, 22) + '...' : title,
            value: hw.packageId,
            description: `Due ${hw.dueDate || hw.dueText || '—'} · ${hw.accuracy || '0%'} · ${taskCount} tasks`
          };
        }));

      components.push(new ActionRowBuilder().addComponents(hwSelect));

      // Check BOTH selected keys
      const selectedId = session?.selectedTaskId || session?.selectedHomework;
      if (selectedId) {
        const selected = homeworkList.find(h => h.packageId === selectedId);
        if (selected) {
          const taskCount = selected.tasks?.length || selected.totalTasks || 0;
          embed.addFields({
            name: 'Selected',
            value: `**${selected.title || 'Homework'}**\nDue: ${selected.dueDate || selected.dueText || '—'}\nTasks: ${taskCount}\nAccuracy: ${selected.accuracy || '0%'}`,
            inline: false
          });

          const startRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sparx:start').setLabel('Start Homework').setStyle(ButtonStyle.Success)
          );
          components.push(startRow);
        }
      }
    } else {
      embed.addFields({ name: 'Homework', value: 'No outstanding homework found. Please login again.' });
    }

    const settingsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sparx:timing').setLabel('⏱ Timing').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sparx:settings').setLabel('⚙ Settings').setStyle(ButtonStyle.Secondary)
    );
    components.push(settingsRow);
  }

  return { embed, components };
}
