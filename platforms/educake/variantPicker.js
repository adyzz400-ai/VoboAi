// language: JavaScript (ESM), file: platforms/educake/variantPicker.js
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { config } from '../../utils/config.js';

const ACCENT = parseInt(config.accent.replace('#', ''), 16);

const EMOJI = {
  educake:   { id: '1560718324600668200', name: 'educake' },
  google:    { id: '1560718367772381284', name: 'google' },
  microsoft: { id: '1560718420431872050', name: 'microsoft' },
};

export function buildVariantEmbed() {
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: 'Vobo AI · Educake' })
    .setTitle('Choose your sign-in method')
    .setDescription(
      'Educake lets schools choose how students log in. Pick whichever one your school uses.\n\n' +
      '**Username** is live now. **Microsoft** and **Google** are being wired up next.',
    );
}

export function buildVariantSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('edu:login:variant')
      .setPlaceholder('Pick a login method…')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Educake')
          .setDescription('Standard Educake username or email + password')
          .setValue('educake')
          .setEmoji(EMOJI.educake),
        new StringSelectMenuOptionBuilder()
          .setLabel('Microsoft')
          .setDescription('Sign in with a Microsoft school account — coming soon')
          .setValue('educake-ms')
          .setEmoji(EMOJI.microsoft),
        new StringSelectMenuOptionBuilder()
          .setLabel('Google')
          .setDescription('Sign in with a Google Workspace account — coming soon')
          .setValue('educake-google')
          .setEmoji(EMOJI.google),
      ),
  );
}