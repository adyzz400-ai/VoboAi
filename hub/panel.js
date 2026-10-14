// language: JavaScript (ESM), file: hub/panel.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../utils/config.js';
import { PLATFORMS } from '../platforms/index.js';

const ACCENT = parseInt(config.accent.replace('#', ''), 16);

export function buildHubEmbed() {
  const supported = Object.values(PLATFORMS).map(p => {
    const variants = p.available
      ? p.loginVariants.filter(v => v.available).map(v => v.label.replace(`${p.name} `, '')).join(', ')
      : 'coming soon';
    return `${p.available ? '●' : '◌'} **${p.name}** — ${variants}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: 'Vobo AI' })
    .addFields(
      { name: 'What this is', value: 'Automates your homework across supported platforms — logs in as you, answers the questions, exports a PDF when it\'s done.' },
      { name: 'Supported platforms', value: supported },
      { name: 'How it works', value:
        '**1.** Press **Start** and pick your platform.\n' +
        '**2.** Enter your login in the popup — nothing is stored in chat.\n' +
        '**3.** Pick a quiz and let it run.\n' +
        '**4.** Get a PDF summary in DMs when it\'s done.' },
    )
    .setFooter({ text: 'Vobo AI · v0.1 · my.educake.co.uk' })
    .setTimestamp();
}

export function buildHubButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hub:start').setLabel('Start').setEmoji('▶').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:tutorial').setLabel('Tutorial').setEmoji('📖').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('hub:settings').setLabel('Settings').setEmoji('⚙').setStyle(ButtonStyle.Secondary),
  );
}
