// language: JavaScript (ESM), file: platforms/sparx/settingsModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { config } from '../../utils/config.js';

export function buildSparxSettingsModal(session) {
  const min = new TextInputBuilder()
    .setCustomId('min').setLabel('Min wait (seconds, 1-200)')
    .setPlaceholder('8').setStyle(TextInputStyle.Short).setRequired(true)
    .setValue(String(session?.waits?.min ?? config.waits.min));

  const max = new TextInputBuilder()
    .setCustomId('max').setLabel('Max wait (seconds, 1-200)')
    .setPlaceholder('15').setStyle(TextInputStyle.Short).setRequired(true)
    .setValue(String(session?.waits?.max ?? config.waits.max));

  const model = new TextInputBuilder()
    .setCustomId('model').setLabel('Gemini model override')
    .setPlaceholder('blank = hub default').setStyle(TextInputStyle.Short).setRequired(false)
    .setValue(session?.model ?? '');

  return new ModalBuilder()
    .setCustomId('sparx:settings:submit')
    .setTitle('Sparx settings')
    .addComponents(
      new ActionRowBuilder().addComponents(min),
      new ActionRowBuilder().addComponents(max),
      new ActionRowBuilder().addComponents(model),
    );
}
