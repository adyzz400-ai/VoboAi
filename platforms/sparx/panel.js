// language: JavaScript (ESM), file: platforms/sparx/panel.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { getPlatform, getTheme } from '../../hub/sessionStore.js';
import { relativeTag } from '../../utils/formatTime.js';

function formatDueDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00Z');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export async function buildPanel({ interaction }) {
  const userId = interaction.user.id;
  const session = getPlatform(userId, 'sparx');
  const hex = getTheme(userId);
  const accent = parseInt(hex.replace('#', ''), 16) || 0x0A78FF;

  const loggedIn = !!session?.jwt;
  const hasTasks = Array.isArray(session?.tasks) && session.tasks.length > 0;

  let statusLine = '○ Not logged in';
  if (loggedIn) statusLine = '● Logged in as *' + session.username + '*';

  let statusExtra = 'Connect your Sparx Maths account to load tasks.';
  if (loggedIn && session?.jwtExpUnix) statusExtra = 'Session expires: ' + relativeTag(session.jwtExpUnix);

  let taskLine = 'Log in to see tasks.';
  if (loggedIn) taskLine = hasTasks ? 'Pick an outstanding task to run:' : 'No outstanding tasks found.';

  let waits = { min: 8, max: 15 };
  if (session && session.waits) waits = session.waits;
  const waitValue = 'Min: ' + waits.min + 's    Max: ' + waits.max + 's';

  const embed = new EmbedBuilder();
  embed.setColor(accent);
  embed.setAuthor({ name: 'Vobo AI · Sparx Maths' });
  embed.addFields(
    { name: 'Status', value: statusLine + '\n' + statusExtra },
    { name: 'Homework', value: taskLine },
    { name: 'Wait per question', value: waitValue }
  );

  const components = [];

  if (loggedIn && hasTasks) {
    const outstanding = session.tasks.filter(t => t.status !== 'completed').slice(0, 25);
    if (outstanding.length > 0) {
      const options = [];
      for (let i = 0; i < outstanding.length; i++) {
        const t = outstanding[i];
        const due = t.dueDate ? ' · due ' + formatDueDate(t.dueDate) : '';
        const total = t.questionCount || 1;
        const correct = t.correctCount || 0;
        const acc = Math.round((correct / total) * 100);
        
        const title = String(t.title).slice(0, 100);
        const desc = (t.subject || 'Maths') + ' · ' + t.questionCount + ' Qs · ' + acc + '% Accuracy' + due;
        
        const opt = new StringSelectMenuOptionBuilder();
        opt.setLabel(title);
        opt.setDescription(desc.slice(0, 100));
        opt.setValue(String(t.taskId));
        if (String(t.taskId) === String(session.selectedTaskId || '')) opt.setDefault(true);
        options.push(opt);
      }

      const menu = new StringSelectMenuBuilder().setCustomId('sparx:task').setPlaceholder('Select a task…').addOptions(options);
      const row = new ActionRowBuilder().addComponents(menu);
      components.push(row);
    }
  }

  const EMOJI_START = { id: '1561456743853326417', name: 'start' };
  const EMOJI_KEY = { id: '1561352697276407828', name: 'key' };
  const EMOJI_CLOCK = { id: '1561352540744851547', name: 'clock' };
  const EMOJI_SETTINGS = { id: '1561352205385076888', name: 'settings' };

  const loginBtn = new ButtonBuilder().setCustomId('sparx:login').setLabel(loggedIn ? 'Re-login' : 'Login').setEmoji(EMOJI_KEY).setStyle(ButtonStyle.Secondary);
  const timingBtn = new ButtonBuilder().setCustomId('sparx:timing').setLabel('Wait time').setEmoji(EMOJI_CLOCK).setStyle(ButtonStyle.Secondary);
  const settingsBtn = new ButtonBuilder().setCustomId('sparx:settings').setLabel('Settings').setEmoji(EMOJI_SETTINGS).setStyle(ButtonStyle.Secondary);
  const startBtn = new ButtonBuilder().setCustomId('sparx:start').setLabel('Start').setEmoji(EMOJI_START).setStyle(ButtonStyle.Primary);
  
  if (!loggedIn || !session?.selectedTaskId) startBtn.setDisabled(true);

  const buttonRow = new ActionRowBuilder().addComponents(loginBtn, timingBtn, settingsBtn, startBtn);
  components.push(buttonRow);

  return { embed: embed, components: components };
}
