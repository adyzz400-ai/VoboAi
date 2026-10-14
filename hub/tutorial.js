// language: JavaScript (ESM), file: hub/tutorial.js
import { EmbedBuilder } from 'discord.js';
import { config } from '../utils/config.js';

const ACCENT = parseInt(config.accent.replace('#', ''), 16);

export function buildTutorialEmbed() {
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: 'Vobo AI · Tutorial' })
    .addFields(
      { name: '1 · Start', value: 'Press **Start** on the hub. Pick your platform in the popup.' },
      { name: '2 · Log in', value: 'A modal appears. Type your username/email and password. They go straight into a headless browser — never into chat, never to disk.' },
      { name: '3 · Pick a quiz', value: 'Once connected, the panel lists every outstanding quiz with its due date and question count. Choose one from the dropdown.' },
      { name: '4 · Run', value: 'Press **Start** again. The panel becomes a live progress card: current question, countdown, running score. Cancel any time.' },
      { name: '5 · Export', value: 'When the run finishes you get a DM with a PDF summary — every question, the answer given, right/wrong, final score.' },
    )
    .setFooter({ text: 'Credentials and session data are in-memory only.' });
}
