// language: JavaScript (ESM), file: platforms/educake/panel.js
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getPlatform } from '../../hub/sessionStore.js';
import { relativeTag, dateOnlyToUnix } from '../../utils/formatTime.js';

const ACCENT = 0x00A8E1;

export async function buildPanel({ interaction }) {
  const userId = interaction.user.id;
  const session = getPlatform(userId, 'educake');

  const loggedIn = !!session?.jwt;
  const hasQuizzes = Array.isArray(session?.quizzes) && session.quizzes.length > 0;

  const statusLine = loggedIn ? `● Logged in as *${session.username}*` : '○ Not logged in';
  const statusExtra = loggedIn && session?.jwtExpUnix
    ? `Session expires: ${relativeTag(session.jwtExpUnix)}`
    : 'Connect your Educake account to load quizzes.';

  const quizLine = loggedIn
    ? (hasQuizzes ? 'Pick an outstanding quiz to run:' : 'No outstanding quizzes found.')
    : 'Log in to see quizzes.';

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: 'Vobo AI · Educake' })
    .addFields(
      { name: 'Status', value: `${statusLine}\n${statusExtra}` },
      { name: 'Quiz', value: quizLine },
      { name: 'Wait per question', value: `Min: ${session?.waits?.min ?? 4}s    Max: ${session?.waits?.max ?? 12}s` },
    );

  const rows = [];

  if (loggedIn && hasQuizzes) {
    const opts = session.quizzes
      .filter(q => q.status !== 'completed' && !q.isArchived)
      .slice(0, 25)
      .map(q => {
        const due = dateOnlyToUnix(q.dueDate);
        const duePart = due ? ` · due ${relativeTag(due)}` : '';
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${q.title}`.slice(0, 100))
          .setDescription(`${q.subject ?? '—'} · ${q.questionCount ?? '?'} Qs${duePart}`.slice(0, 100))
          .setValue(String(q.attemptId))
          .setDefault(String(q.attemptId) === String(session.selectedAttemptId ?? ''));
      });
    if (opts.length) {
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('edu:quiz').setPlaceholder('Select a quiz…').addOptions(opts),
      ));
      // Timing button lives ONLY in this row's sibling — visible only when quizzes are loaded
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('edu:timing').setLabel('Set wait time').setEmoji('🕒').setStyle(ButtonStyle.Secondary),
      ));
    }
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hub:back').setLabel('Hub').setEmoji('⬅').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('edu:login').setLabel(loggedIn ? 'Re-login' : 'Login').setEmoji('🔑').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('edu:settings').setLabel('Settings').setEmoji('⚙').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('edu:start').setLabel('Start').setEmoji('▶').setStyle(ButtonStyle.Success)
      .setDisabled(!loggedIn || !session.selectedAttemptId),
  ));

  return { embed, components: rows };
}