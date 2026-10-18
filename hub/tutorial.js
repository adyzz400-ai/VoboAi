// language: JavaScript (ESM), file: hub/tutorial.js
import { EmbedBuilder } from 'discord.js';
import { config } from '../utils/config.js';

const ACCENT = parseInt(config.accent.replace('#', ''), 16);

export function buildTutorialEmbed() {
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: 'Vobo AI · Tutorial' })
    .setDescription(
      '**1 · Start**\n' +
      '• Press **Start** on the hub.\n' +
      '• Pick your platform in the popup.\n\n' +
      '**2 · Log in**\n' +
      '• A modal appears. Type your username/email and password.\n' +
      '• They go straight into a headless browser — never into chat.\n\n' +
      '**3 · Pick a quiz**\n' +
      '• Once connected, the panel lists every outstanding quiz with its due date and question count.\n' +
      '• Choose one from the dropdown.\n\n' +
      '**4 · Run**\n' +
      '• Press **Start** again.\n' +
      '• The panel becomes a live progress card: current question, countdown, running score.\n' +
      '• Cancel any time.\n\n' +
      '**5 · Export**\n' +
      '• When the run finishes you get a DM with a PDF summary — every question, the answer given, right/wrong, final score.'
    )
    .setFooter({ text: 'Credentials and session data are in-memory only.' });
}