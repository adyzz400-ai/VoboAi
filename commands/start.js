// language: JavaScript (ESM), file: commands/start.js
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildHubEmbed, buildHubButtons } from '../hub/panel.js';

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Open the Vobo AI panel');

export async function execute(interaction) {
  await interaction.reply({
    embeds: [buildHubEmbed()],
    components: [buildHubButtons()],
    flags: MessageFlags.Ephemeral,
  });
}
