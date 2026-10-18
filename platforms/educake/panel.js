// language: JavaScript (ESM), file: platforms/educake/panel.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';
import { getPlatform, getTheme } from '../../hub/sessionStore.js';
import { relativeTag } from '../../utils/formatTime.js';

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
  if (session && session.waits) {
    waits = session.waits;
  }
  
  const waitValue = 'Min: ' + waits.min + 's    Max: ' + waits.max + 's';
  
  const embed = new EmbedBuilder();
  embed.setColor(accent);
  embed.setAuthor({ name: 'Vobo AI · Educake' });
  embed.addFields({ name: 'Status', value: statusLine + '\n' + statusExtra }, { name: 'Quiz', value: quizLine }, { name: 'Wait per question', value: waitValue });
  
  const components = [];
  
  if (loggedIn && hasQuizzes) {
    const outstanding = session.quizzes.filter(q => q.status !== 'completed' && !q.isArchived).slice(0, 25);
    if (outstanding.length > 0) {
      const options = [];
      
      for (let i = 0; i < outstanding.length; i++) {
        const q = outstanding[i];
        const due = q.dueDate ? ' · due ' + q.dueDate : '';
        const total = q.questionCount || 1;
        const correct = q.correctCount || 0;
        const acc = Math.round((correct / total) * 100);
        
        const title = String(q.title).slice(0, 100);
        const desc = (q.subject || '—') + ' · ' + q.questionCount + ' Qs · ' + acc + '% Accuracy' + due;
        
        const opt = new StringSelectMenuOptionBuilder();
        opt.setLabel(title);
        opt.setDescription(desc.slice(0, 100));
        opt.setValue(String(q.attemptId));
        
        if (String(q.attemptId) === String(session.selectedAttemptId || '')) {
          opt.setDefault(true);
        }
        
        options.push(opt);
      }
      
      const menu = new StringSelectMenuBuilder();
      menu.setCustomId('edu:quiz');
      menu.setPlaceholder('Select a quiz…');
      menu.addOptions(options);
      
      const row = new ActionRowBuilder();
      row.addComponents(menu);
      components.push(row);
    }
  }
  
  const EMOJI_START = { id: '1561456743853326417', name: 'start' };
  const EMOJI_KEY = { id: '1561352697276407828', name: 'key' };
  const EMOJI_CLOCK = { id: '1561352540744851547', name: 'clock' };
  const EMOJI_SETTINGS = { id: '1561352205385076888', name: 'settings' };
  
  const loginBtn = new ButtonBuilder();
  loginBtn.setCustomId('edu:login');
  loginBtn.setLabel(loggedIn ? 'Re-login' : 'Login');
  loginBtn.setEmoji(EMOJI_KEY);
  loginBtn.setStyle(ButtonStyle.Secondary);
  
  const timingBtn = new ButtonBuilder();
  timingBtn.setCustomId('edu:timing');
  timingBtn.setLabel('Wait time');
  timingBtn.setEmoji(EMOJI_CLOCK);
  timingBtn.setStyle(ButtonStyle.Secondary);
  
  const settingsBtn = new ButtonBuilder();
  settingsBtn.setCustomId('edu:settings');
  settingsBtn.setLabel('Settings');
  settingsBtn.setEmoji(EMOJI_SETTINGS);
  settingsBtn.setStyle(ButtonStyle.Secondary);
  
  const startBtn = new ButtonBuilder();
  startBtn.setCustomId('edu:start');
  startBtn.setLabel('Start');
  startBtn.setEmoji(EMOJI_START);
  startBtn.setStyle(ButtonStyle.Primary);
  
  if (!loggedIn || !session?.selectedAttemptId) {
    startBtn.setDisabled(true);
  }
  
  const buttonRow = new ActionRowBuilder();
  buttonRow.addComponents(loginBtn, timingBtn, settingsBtn, startBtn);
  components.push(buttonRow);
  
  return { embed: embed, components: components };
}