// language: JavaScript (ESM), file: handlers/startModalSubmit.js
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../utils/config.js';
import { resolvePlatformFromLoginValue, VALID_LOGIN_VALUES } from '../platforms/index.js';

const ACCENT = parseInt(config.accent.replace('#', ''), 16);

export async function handleStartModal(interaction) {
  const value = interaction.fields.getTextInputValue('platform').trim().toLowerCase();
  const platform = resolvePlatformFromLoginValue(value);
  if (!platform) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI' })
        .setDescription(`Unknown platform \`${value}\`.\nValid: \`${VALID_LOGIN_VALUES.join('`, `')}\``)],
    });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { embed, components } = await platform.panel({ interaction, loginVariant: value });
  await interaction.editReply({ embeds: [embed], components });
}
