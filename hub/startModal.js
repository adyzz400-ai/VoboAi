// language: JavaScript (ESM), file: hub/startModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { PLATFORMS } from '../platforms/index.js';

export function buildStartModal() {
  const options = Object.values(PLATFORMS)
    .filter(p => p.available)
    .flatMap(p => p.loginVariants.filter(v => v.available).map(v => v.id));
  
  const input = new TextInputBuilder();
  input.setCustomId('platform');
  input.setLabel('Platform');
  input.setPlaceholder(options.join(' · '));
  input.setStyle(TextInputStyle.Short);
  input.setRequired(true);
  input.setMaxLength(32);
  
  const row = new ActionRowBuilder();
  row.addComponents(input);
  
  const modal = new ModalBuilder();
  modal.setCustomId('hub:start:submit');
  modal.setTitle('Start a run');
  modal.addComponents(row);
  
  return modal;
}
