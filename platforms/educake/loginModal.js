// language: JavaScript (ESM), file: platforms/educake/loginModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export function buildEducakeLoginModal() {
  const u = new TextInputBuilder()
    .setCustomId('username').setLabel('Username or email')
    .setPlaceholder('you@school.edu / jamie_k')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120);
  const p = new TextInputBuilder()
    .setCustomId('password').setLabel('Password')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120);
  return new ModalBuilder()
    .setCustomId('edu:login:submit')
    .setTitle('Educake login')
    .addComponents(new ActionRowBuilder().addComponents(u), new ActionRowBuilder().addComponents(p));
}
