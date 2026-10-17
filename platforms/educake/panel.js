// language: JavaScript (ESM), file: platforms/educake/panel.js
import {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} from 'discord.js';
import { getPlatform, getTheme } from '../../hub/sessionStore.js';
import { relativeTag } from '../../utils/formatTime.js';

function formatDueDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00Z');
  if (isNaN(d.getTime())) return dateStr;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNum = d.getDate();
  let suffix = 'th';
  if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = 'st';
  else if (dayNum === 2 || dayNum === 22) suffix = 'nd';
  else if (dayNum === 3 || dayNum === 23) suffix = 'rd';
  return days[d.getDay()] + ' ' + dayNum + suffix + ' ' + months[d.getMonth()];
}

export async function buildPanel({ interaction }) {
  const userId = interaction.user.id;
  const session = getPlatform(userId, 'educake');
  const hex = getTheme(userId);
  const accent = parseInt(hex.replace('#', ''), 16);

  const loggedIn = !!session?.jwt;
  const hasQuizzes = Array.isArray(session?.quizzes) && session.quizzes.length > 0;

  let statusLine = '○ Not logged in';
  if (loggedIn) {
    statusLine = '● Logged in as *' + session.username + '*';
  }

  let statusExtra = 'Connect your Educake account to load quizzes.';
  if (loggedIn && session?.jwtExpUnix) {
    statusExtra = 'Session expires: ' + relativeTag(session.jwtExpUnix);
  }

  let quizLine = 'Log in to see quizzes.';
  if (loggedIn) {
    if (hasQuizzes) {
      quizLine = 'Pick an outstanding quiz to run:';
    } else {
      quizLine = 'No outstanding quizzes found.';
    }
  }

  let waits = { min: 8, max: 15 };
  if (session && session.waits) waits = session.waits;
  const waitValue = 'Min: ' + waits.min + 's    Max: ' + waits.max + 's';

  const container = new ContainerBuilder();
  container.setAccentColor(accent);
  
  // 1. Title
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('### Vobo AI · Educake')
  );
  
  container.addSeparatorComponents(new SeparatorBuilder());

  // 2. Status
  const statusText = '**Status**\n' + statusLine + '\n' + statusExtra +
    '\n\n**Quiz**\n' + quizLine +
    '\n\n**Wait per question**\n' + waitValue;
    
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(statusText)
  );
  
  container.addSeparatorComponents(new SeparatorBuilder());

  // 3. Dropdown
  if (loggedIn && hasQuizzes) {
    const outstanding = session.quizzes.filter(q => q.status !== 'completed' && !q.isArchived).slice(0, 25);
    
    if (outstanding.length > 0) {
      const options = outstanding.map(q => {
        const due = q.dueDate ? ' · due ' + formatDueDate(q.dueDate) : '';
        const total = q.questionCount || 1;
        const correct = q.correctCount || 0;
        const acc = Math.round((correct / total) * 100);
        
        return new StringSelectMenuOptionBuilder()
          .setLabel(String(q.title).slice(0, 100))
          .setDescription(`${q.subject || '—'} · ${q.questionCount} Qs · ${acc}% Accuracy${due}`.slice(0, 100))
          .setValue(String(q.attemptId))
          .setDefault(String(q.attemptId) === String(session.selectedAttemptId || ''));
      });

      const menu = new StringSelectMenuBuilder().setCustomId('edu:quiz').setPlaceholder('Select a quiz…').addOptions(options);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(menu));
    }
  }

  // 4. Buttons
  const loginBtn = new ButtonBuilder().setCustomId('edu:login').setLabel(loggedIn ? 'Re-login' : 'Login').setEmoji('🔑').setStyle(ButtonStyle.Primary);
  const timingBtn = new ButtonBuilder().setCustomId('edu:timing').setLabel('Wait time').setEmoji('🕒').setStyle(ButtonStyle.Secondary);
  const settingsBtn = new ButtonBuilder().setCustomId('edu:settings').setLabel('Settings').setEmoji('⚙').setStyle(ButtonStyle.Secondary);
  const startBtn = new ButtonBuilder().setCustomId('edu:start').setLabel('Start').setEmoji('▶').setStyle(ButtonStyle.Success);
  
  if (!loggedIn || !session.selectedAttemptId) startBtn.setDisabled(true);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(loginBtn, timingBtn, settingsBtn, startBtn)
  );

  return { components: [container] };
}
