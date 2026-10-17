// VER-PANEL-B
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
  const allQuizzes = session.quizzes ?? [];
  const outstanding = allQuizzes.filter(function (q) {
    return q.status !== 'completed' && !q.isArchived;
  });
  const capped = outstanding.slice(0, 25);
  if (capped.length === 0) return null;

  const options = [];
  for (const q of capped) {
    const due = dateOnlyToUnix(q.dueDate);
    let duePart = '';
    if (due) duePart = ' · due ' + relativeTag(due);
    const title = String(q.title || '').slice(0, 100);
    const subj = String(q.subject || '—');
    const count = q.questionCount ?? '?';
    const desc = (subj + ' · ' + count + ' Qs' + duePart).slice(0, 100);
    const value = String(q.attemptId);
    const isDefault = value === String(session.selectedAttemptId ?? '');
    
    const opt = new StringSelectMenuOptionBuilder();
    opt.setLabel(title);
    opt.setDescription(desc);
    opt.setValue(value);
    opt.setDefault(isDefault);
    options.push(opt);
  }

  const menu = new StringSelectMenuBuilder();
  menu.setCustomId('edu:quiz');
  menu.setPlaceholder('Select a quiz…');
  menu.addOptions(options);

  const row = new ActionRowBuilder();
  row.addComponents(menu);
  return row;
}

function buildTimingRow() {
  const btn = new ButtonBuilder();
  btn.setCustomId('edu:timing');
  btn.setLabel('Set wait time');
  btn.setEmoji('🕒');
  btn.setStyle(ButtonStyle.Secondary);
  
  const row = new ActionRowBuilder();
  row.addComponents(btn);
  return row;
}

function buildControlRow(session) {
  const loggedIn = !!session?.jwt;
  const hasSelection = !!session?.selectedAttemptId;

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
  if (!loggedIn || !hasSelection) {
    start.setDisabled(true);
  }

  const row = new ActionRowBuilder();
  row.addComponents(hub, login, settings, start);
  return row;
}

export async function buildPanel(args) {
  const interaction = args.interaction;
  const userId = interaction.user.id;
  const session = getPlatform(userId, 'educake');
  const hex = getTheme(userId);
  const ACCENT = parseInt(hex.replace('#', ''), 16);

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

  let waits = { min: 4, max: 12 };
  if (session && session.waits) waits = session.waits;
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
    const selectRow = buildQuizSelect(session);
    if (selectRow) {
      rows.push(selectRow);
      rows.push(buildTimingRow());
    }
  }
  rows.push(buildControlRow(session));

  return { embed: embed, components: rows };
}