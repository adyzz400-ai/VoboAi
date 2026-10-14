// language: JavaScript (ESM), file: hub/startModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { PLATFORMS } from '../platforms/index.js';

export function buildStartModal() {
  const options = Object.values(PLATFORMS)
    .filter(p => p.available)
    .flatMap(p => p.loginVariants.filter(v => v.available).map(v => v.id));

  const input = new TextInputBuilder()
    .setCustomId('platform')
    .setLabel('Platform')
    .setPlaceholder(options.join(' · '))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);

  return new ModalBuilder()
    .setCustomId('hub:start:submit')
    .setTitle('Start a run')
    .addComponents(new ActionRowBuilder().addComponents(input));
}
