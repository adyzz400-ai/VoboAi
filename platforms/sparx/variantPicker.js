// language: JavaScript (ESM), file: platforms/sparx/variantPicker.js
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

const EMOJI = {
  sparx: { id: '1561514118265970901', name: 'sparx' },
  google: { id: '1561514167909883914', name: 'google' },
  microsoft: { id: '1561514216244904097', name: 'microsoft' },
};

export function buildSparxVariantEmbed(accent) {
  return new EmbedBuilder()
    .setColor(accent || 0x0A78FF)
    .setAuthor({ name: 'Vobo AI · Sparx Maths' })
    .setTitle('Choose your sign-in method')
    .setDescription('Sparx lets schools choose how students log in. Pick whichever one your school uses.\n\n**Username** is live now. **Microsoft** and **Google** are being wired up next.');
}

export function buildSparxVariantSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('sparx:login:variant')
      .setPlaceholder('Pick a login method…')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Sparx Maths').setDescription('Standard Sparx username and password').setValue('sparx').setEmoji(EMOJI.sparx),
        new StringSelectMenuOptionBuilder().setLabel('Microsoft').setDescription('Sign in with a Microsoft school account — coming soon').setValue('sparx-ms').setEmoji(EMOJI.microsoft),
        new StringSelectMenuOptionBuilder().setLabel('Google').setDescription('Sign in with a Google Workspace account — coming soon').setValue('sparx-google').setEmoji(EMOJI.google)
      )
  );
}
