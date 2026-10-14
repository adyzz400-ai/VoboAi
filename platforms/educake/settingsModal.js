// language: JavaScript (ESM), file: platforms/educake/settingsModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { config } from '../../utils/config.js';

export function buildEducakeSettingsModal(session) {
  const min = new TextInputBuilder()
    .setCustomId('min').setLabel('Min wait (seconds)')
    .setPlaceholder('4').setStyle(TextInputStyle.Short).setRequired(true)
    .setValue(String(session?.waits?.min ?? config.waits.min));

  const max = new TextInputBuilder()
    .setCustomId('max').setLabel('Max wait (seconds)')
    .setPlaceholder('12').setStyle(TextInputStyle.Short).setRequired(true)
    .setValue(String(session?.waits?.max ?? config.waits.max));

  const img = new TextInputBuilder()
    .setCustomId('includeImages').setLabel('Include images in PDF')
    .setPlaceholder('yes / no').setStyle(TextInputStyle.Short).setRequired(false)
    .setValue(session?.includeImages === false ? 'no' : 'yes');

  const model = new TextInputBuilder()
    .setCustomId('model').setLabel('Gemini model override')
    .setPlaceholder('blank = hub default').setStyle(TextInputStyle.Short).setRequired(false)
    .setValue(session?.model ?? '');

  return new ModalBuilder()
    .setCustomId('edu:settings:submit')
    .setTitle('Educake settings')
    .addComponents(
      new ActionRowBuilder().addComponents(min),
      new ActionRowBuilder().addComponents(max),
      new ActionRowBuilder().addComponents(img),
      new ActionRowBuilder().addComponents(model),
    );
}
