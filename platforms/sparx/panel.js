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

  // 1. Handle unauthenticated state (was missing, causing the login button to vanish)
  if (!isLoggedIn) {
    embed.setDescription('**Not logged in.**\n\nConnect your Sparx Maths account to load homework and start automating.');
    
    const loginBtn = new ButtonBuilder()
      .setCustomId('sparx:login')
      .setLabel('Login')
      .setStyle(ButtonStyle.Primary);
    
    components.push(new ActionRowBuilder().addComponents(loginBtn));
  } else {
    embed.setDescription('**Welcome to Sparx Automation**\n\nSelect a homework below to start.');
    
    // 2. Match the actual key used by handlers.js and parser.js ('tasks', not 'homeworks')
    if (session?.tasks && session.tasks.length > 0) {
      const hwSelect = new StringSelectMenuBuilder()
        .setCustomId('sparx:task') // 3. Match the actual handler name in handlers.js
        .setPlaceholder('Select homework...')
        .addOptions(session.tasks.map(hw => ({
          label: hw.title.length > 25 ? hw.title.slice(0, 22) + '...' : hw.title,
          value: hw.packageId,
          // 4. Use hw.tasks?.length for accurate task count from parser.js output
          description: `Due ${hw.dueDate || hw.dueText || '—'} · ${hw.accuracy || '0%'} · ${hw.tasks?.length || 0} tasks`
        })));

      components.push(new ActionRowBuilder().addComponents(hwSelect));

      // 5. Match the actual state key ('selectedTaskId', not 'selectedHomework')
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
