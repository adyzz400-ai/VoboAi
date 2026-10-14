// language: JavaScript (ESM), file: platforms/educake/timingModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { config } from '../../utils/config.js';

export function buildTimingModal(session) {
  const min = new TextInputBuilder()
    .setCustomId('min').setLabel('Min wait (seconds)')
    .setPlaceholder('4').setStyle(TextInputStyle.Short).setRequired(true)
    .setValue(String(session?.waits?.min ?? config.waits.min));
  const max = new TextInputBuilder()
    .setCustomId('max').setLabel('Max wait (seconds)')
    .setPlaceholder('12').setStyle(TextInputStyle.Short).setRequired(true)
    .setValue(String(session?.waits?.max ?? config.waits.max));
  return new ModalBuilder()
    .setCustomId('edu:timing:submit')
    .setTitle('Educake timing')
    .addComponents(new ActionRowBuilder().addComponents(min), new ActionRowBuilder().addComponents(max));
}