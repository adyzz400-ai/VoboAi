// language: JavaScript (ESM), file: handlers/startModalSubmit.js
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../utils/config.js';
import { resolvePlatformFromLoginValue, VALID_LOGIN_VALUES } from '../platforms/index.js';

export async function handleStartModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const value = interaction.fields.getTextInputValue('platform').trim().toLowerCase();
  const platform = resolvePlatformFromLoginValue(value);
  
  if (!platform) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI' })
        .setDescription(`Unknown platform \`${value}\`.\nValid: \`${VALID_LOGIN_VALUES.join('`, `')}\``)],
    });
  }
  
  try {
    const panel = await platform.panel({ interaction, loginVariant: value });
    // Send the Component V2 panel with the required flag
    await interaction.editReply({ 
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      embeds: [],
      components: panel.components
    });
  } catch (err) {
    const embed = new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI' })
      .setDescription('Failed to build the panel: ' + err.message);
    await interaction.editReply({ embeds: [embed] }).catch(() => {});
  }
}
