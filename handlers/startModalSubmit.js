// language: JavaScript (ESM), file: handlers/startModalSubmit.js
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../utils/config.js';
import { resolvePlatformFromLoginValue, VALID_LOGIN_VALUES } from '../platforms/index.js';
import { log, error } from '../utils/logger.js';

export async function handleStartModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let value = '';
  try {
    value = interaction.fields.getTextInputValue('platform').trim().toLowerCase();
  } catch (err) {
    log('[start] No platform field provided, defaulting to educake');
    value = 'educake';
  }

  const platform = resolvePlatformFromLoginValue(value);
  
  if (!platform) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI' })
        .setDescription(`Unknown platform \`${value}\`.\nValid: \`${VALID_LOGIN_VALUES.join('`, `')}\``)],
    });
  }
  
  try {
    const panel = await platform.panel({ interaction, loginVariant: value });
    await interaction.editReply({ 
      embeds: [panel.embed],
      components: panel.components
    });
  } catch (err) {
    error('[start] Failed to build panel', err);
    const embed = new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI' })
      .setDescription('Failed to build the panel: ' + err.message);
    await interaction.editReply({ embeds: [embed] }).catch(() => {});
  }
}
