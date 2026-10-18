// language: JavaScript (ESM), file: platforms/educake/variantPicker.js
import { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

const EMOJI = {
  educake: { id: '1560718324600668200', name: 'educake' },
  google: { id: '1560718367772381284', name: 'google' },
  microsoft: { id: '1560718420431872050', name: 'microsoft' },
};

export function buildVariantPanel(accent) {
  const container = new ContainerBuilder();
  container.setAccentColor(accent);
  
  const text = '### Choose your sign-in method\n' +
    'Educake lets schools choose how students log in. Pick whichever one your school uses.\n\n' +
    '**Username** is live now. **Microsoft** and **Google** are being wired up next.';
  
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  
  const select = new StringSelectMenuBuilder()
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
    );
  
  container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  return { components: [container] };
}
