// language: JavaScript (ESM), file: hub/panel.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../utils/config.js';
import { PLATFORMS } from '../platforms/index.js';

const parseHex = (hex) => parseInt(hex.replace('#', ''), 16);

function hubDescription() {
  const lines = [
    '**Vobo AI** is your personal homework assistant. It signs in to your school platforms, reads the questions, answers them, and hands you a clean PDF of the whole session when it is done - so you can focus on actually understanding the work instead of grinding through 40 questions at midnight.',
    '',
    '🔐 **Your credentials never touch the chat.** Every login goes straight into a headless browser that lives only in memory. Nothing is stored to disk, nothing is logged, and the session is dropped the moment the bot restarts.',
    '',
    '⚡ **Multiple users run at once.** Every session is private and isolated - your login, your quizzes, your PDF. Runs queue cleanly so nobody\'s answers interfere with anybody else\'s.',
    '',
    '📄 **A PDF lands in your DMs** at the end of each run: every question, the answer given, whether it was right, Educake\'s own explanation where available, and your final score.',
  ];
  return lines.join('\n');
}

function supportedBlock() {
  return Object.values(PLATFORMS).map(p => {
    const variants = p.available
      ? p.loginVariants.filter(v => v.available).map(v => v.label.replace(p.name + ' ', '')).join(' · ')
      : 'coming soon';
    return (p.available ? '🟢 ' : '⚪ ') + '**' + p.name + '**\n> ' + variants;
  }).join('\n');
}

function howItWorksBlock() {
  const lines = [
    '**1.** Press **Start** below and choose your platform.',
    '**2.** Log in through a secure popup - nothing is stored in chat.',
    '**3.** Pick which quiz you want to run from the live dropdown.',
    '**4.** Press **Start** on the panel and watch progress stream in real time.',
    '**5.** Get your PDF summary in DMs the moment it finishes.',
  ];
  return lines.join('\n');
}

function controlsBlock() {
  const lines = [
    '**▶ Start** - begin a new run',
    '**📖 Tutorial** - walkthrough of the whole flow',
    '**🎨 Theme** - change the embed accent colour',
    '**⚙ Settings** - default Gemini model, PDF delivery, and more',
  ];
  return lines.join('\n');
}

export function buildHubEmbed(themeHex) {
  const hex = themeHex ?? config.accent;

  return new EmbedBuilder()
    .setColor(parseHex(hex))
    .setAuthor({ name: 'Vobo AI', iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
    .setTitle('🎓 Homework on autopilot')
    .setDescription(hubDescription())
    .addFields(
      { name: '📚  Supported platforms', value: supportedBlock(), inline: false },
      { name: '🚀  How it works', value: howItWorksBlock(), inline: false },
      { name: '🛠  Controls', value: controlsBlock(), inline: false },
    )
    .setFooter({ text: 'Vobo AI · v0.1 · sessions in-memory only · my.educake.co.uk' })
    .setTimestamp();
}

export function buildHubButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hub:start').setLabel('Start').setEmoji('▶').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:tutorial').setLabel('Tutorial').setEmoji('📖').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('hub:theme').setLabel('Theme').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:settings').setLabel('Settings').setEmoji('⚙').setStyle(ButtonStyle.Secondary),
  );
}