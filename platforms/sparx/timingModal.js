// language: JavaScript (ESM), file: platforms/sparx/timingModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { config } from '../../utils/config.js';

export function buildSparxTimingModal(session) {
  const min = new TextInputBuilder()
    .setCustomId('min').setLabel('Min wait (seconds, 1-200)')
    .setPlaceholder('8').setStyle(TextInputStyle.Short).setRequired(true)
    .setValue(String(session?.waits?.min ?? config.waits.min));
  const max = new TextInputBuilder()
    .setCustomId('max').setLabel('Max wait (seconds, 1-200)')
    .setPlaceholder('15').setStyle(TextInputStyle.Short).setRequired(true)
    .setValue(String(session?.waits?.max ?? config.waits.max));
  return new ModalBuilder()
    .setCustomId('sparx:timing:submit')
    .setTitle('Sparx timing')
    .addComponents(new ActionRowBuilder().addComponents(min), new ActionRowBuilder().addComponents(max));
}
