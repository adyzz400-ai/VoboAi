// language: JavaScript (ESM), file: platforms/educake/panel.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getPlatform, getTheme } from '../../hub/sessionStore.js';
import { relativeTag, dateOnlyToUnix } from '../../utils/formatTime.js';

function buildQuizSelect(session) {
  const list = (session.quizzes ?? [])
    .filter(function (q) { return q.status !== 'completed'; })
    .filter(function (q) { return !q.isArchived; })
    .slice(0, 25);

  if (list.length === 0) return null;

  const opts = list.map(function (q) {
    const due = dateOnlyToUnix(q.dueDate);
    let duePart = '';
    if (due) duePart = ' · due ' + relativeTag(due);
    const title = String(q.title || '').slice(0, 100);
    const subj = String(q.subject || '—');
    const count = q.questionCount ?? '?';
    const desc = (subj + ' · ' + count + ' Qs' + duePart).slice(0, 100);
    const value = String(q.attemptId);
    const isDefault = value === String(session.selectedAttemptId ?? '');
    return new StringSelectMenuOptionBuilder()
      .setLabel(title)
      .setDescription(desc)
      .setValue(value)
      .setDefault(isDefault);
  });

  const menu = new StringSelectMenuBuilder();
  menu.setCustomId('edu:quiz');
  menu.setPlaceholder('Select a quiz…');
  menu.addOptions(opts);
  return new ActionRowBuilder().addComponents(menu);
}

function buildTimingRow() {
  const btn = new ButtonBuilder();
  btn.setCustomId('edu:timing');
  btn.setLabel('Set wait time');
  btn.setEmoji('🕒');
  btn.setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(btn);
}

function buildControlRow(session) {
  const loggedIn = !!session?.jwt;
  const hub = new ButtonBuilder();
  hub.setCustomId('hub:back');
  hub.setLabel('Hub');
  hub.setEmoji('⬅');
  hub.setStyle(ButtonStyle.Secondary);

  const login = new ButtonBuilder();
  login.setCustomId('edu:login');
  login.setLabel(loggedIn ? 'Re-login' : 'Login');
  login.setEmoji('🔑');
  login.setStyle(ButtonStyle.Primary);

  const settings = new ButtonBuilder();
  settings.setCustomId('edu:settings');
  settings.setLabel('Settings');
  settings.setEmoji('⚙');
  settings.setStyle(ButtonStyle.Secondary);

  const start = new ButtonBuilder();
  start.setCustomId('edu:start');
  start.setLabel('Start');
  start.setEmoji('▶');
  start.setStyle(ButtonStyle.Success);
  start.setDisabled(!loggedIn || !session?.selectedAttemptId);

  const row = new ActionRowBuilder();
  row.addComponents(hub, login, settings, start);
  return row;
}

export async function buildPanel({ interaction }) {
  const userId = interaction.user.id;
  const session = getPlatform(userId, 'educake');
  const ACCENT = parseInt(getTheme(userId).replace('#', ''), 16);

  const loggedIn = !!session?.jwt;
  const hasQuizzes = Array.isArray(session?.quizzes) && session.quizzes.length > 0;

  let statusLine = '○ Not logged in';
  if (loggedIn) statusLine = '● Logged in as *' + session.username + '*';

  let statusExtra = 'Connect your Educake account to load quizzes.';
  if (loggedIn && session?.jwtExpUnix) {
    statusExtra = 'Session expires: ' + relativeTag(session.jwtExpUnix);
  }

  let quizLine = 'Log in to see quizzes.';
  if (loggedIn) quizLine = hasQuizzes ? 'Pick an outstanding quiz to run:' : 'No outstanding quizzes found.';

  const waits = session?.waits ?? { min: 4, max: 12 };
  const waitValue = 'Min: ' + waits.min + 's    Max: ' + waits.max + 's';

  const embed = new EmbedBuilder();
  embed.setColor(ACCENT);
  embed.setAuthor({ name: 'Vobo AI · Educake' });
  embed.addFields(
    { name: 'Status', value: statusLine + '\n' + statusExtra },
    { name: 'Quiz', value: quizLine },
    { name: 'Wait per question', value: waitValue },
  );

  const rows = [];
  if (loggedIn && hasQuizzes) {
    const select = buildQuizSelect(session);
    if (select) {
      rows.push(select);
      rows.push(buildTimingRow());
    }
  }
  rows.push(buildControlRow(session));

  return { embed: embed, components: rows };
}