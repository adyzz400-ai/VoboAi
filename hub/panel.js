// language: JavaScript (ESM), file: hub/panel.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../utils/config.js';
import { PLATFORMS } from '../platforms/index.js';

function getAccent(hexStr) {
  const cleanHex = hexStr.replace('#', '');
  return parseInt(cleanHex, 16);
}

function hubDescription() {
  return [
    '**Vobo AI** is your personal homework assistant. It signs in to your school platforms, reads the questions, answers them, and hands you a clean PDF of the whole session when it is done.',
    '',
    '**Your credentials never touch the chat.** Every login goes straight into a headless browser that lives only in memory.',
    '',
    '**Multiple users run at once.** Every session is private and isolated.',
    '',
    '**A PDF lands in your DMs** at the end of each run with every question and answer.',
  ].join('\n');
}

function supportedBlock() {
  return Object.values(PLATFORMS).map(p => {
    const variants = p.available
      ? p.loginVariants.filter(v => v.available).map(v => v.label.replace(p.name + ' ', '')).join(' · ')
      : 'coming soon';
    return '• **' + p.name + '** — ' + variants;
  }).join('\n');
}

export function buildHubEmbed(themeHex) {
  const hex = themeHex ?? config.accent;
  return new EmbedBuilder()
    .setColor(getAccent(hex))
    .setAuthor({ name: 'Vobo AI', iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
    .setTitle('Homework on autopilot')
    .setDescription(hubDescription())
    .addFields(
      { name: 'Supported platforms', value: supportedBlock(), inline: false },
    );
}

export function buildHubButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hub:start').setLabel('Start').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('hub:tutorial').setLabel('Tutorial').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:settings').setLabel('Settings').setStyle(ButtonStyle.Secondary),
  );
}
