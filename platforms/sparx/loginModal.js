// language: JavaScript (ESM), file: platforms/sparx/loginModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export function buildSparxLoginModal() {
  const schoolInput = new TextInputBuilder()
    .setCustomId('school')
    .setLabel('School name')
    .setPlaceholder('e.g., Springfield High School')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const usernameInput = new TextInputBuilder()
    .setCustomId('username')
    .setLabel('Username')
    .setPlaceholder('Your Sparx username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const passwordInput = new TextInputBuilder()
    .setCustomId('password')
    .setLabel('Password')
    .setPlaceholder('Your Sparx password')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const modal = new ModalBuilder()
    .setCustomId('sparx:login:submit')
    .setTitle('Sparx Maths login');

  modal.addComponents(
    new ActionRowBuilder().addComponents(schoolInput),
    new ActionRowBuilder().addComponents(usernameInput),
    new ActionRowBuilder().addComponents(passwordInput)
  );
  
  return modal;
}
