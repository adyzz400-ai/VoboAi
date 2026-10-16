// language: JavaScript (ESM), file: hub/settingsModal.js
import {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} from 'discord.js';
import { config } from '../utils/config.js';

export function buildHubSettingsModal(current = {}) {
  const model = new TextInputBuilder()
    .setCustomId('geminiModel').setLabel('Default Gemini model')
    .setPlaceholder('gemini-3.5-flash-lite').setStyle(TextInputStyle.Short)
    .setRequired(false).setValue(current.geminiModel ?? config.geminiDefault);

  const dm = new TextInputBuilder()
    .setCustomId('dmPdf').setLabel('DM me a PDF when a run finishes')
    .setPlaceholder('yes / no').setStyle(TextInputStyle.Short)
    .setRequired(false).setValue(current.dmPdf == null ? 'yes' : (current.dmPdf ? 'yes' : 'no'));

  return new ModalBuilder()
    .setCustomId('hub:settings:submit')
    .setTitle('Vobo AI settings')
    .addComponents(
      new ActionRowBuilder().addComponents(model),
      new ActionRowBuilder().addComponents(dm),
    );
}

export function parseHubSettings(values) {
  const v = Object.fromEntries(values.fields.map(f => [f.customId, f.value?.trim()]));
  return {
    geminiModel: v.geminiModel || config.geminiDefault,
    dmPdf: (v.dmPdf ?? '').toLowerCase() !== 'no',
  };
}

export const THEME_COLORS = [
  { value: '00A8E1', label: 'Educake Blue',  emoji: '🔵' },
  { value: '22C55E', label: 'Success Green', emoji: '🟢' },
  { value: 'A855F7', label: 'Violet',        emoji: '🟣' },
  { value: 'F97316', label: 'Sunset Orange', emoji: '🟠' },
  { value: 'EF4444', label: 'Crimson',       emoji: '🔴' },
  { value: 'EAB308', label: 'Gold',          emoji: '🟡' },
  { value: '06B6D4', label: 'Cyan',          emoji: '🩵' },
  { value: 'EC4899', label: 'Pink',          emoji: '🩷' },
  { value: '0F172A', label: 'Slate',         emoji: '⚫' },
];

export function buildThemeEmbed(currentHex = config.accent) {
  return new EmbedBuilder()
    .setColor(parseInt(currentHex.replace('#', ''), 16))
    .setAuthor({ name: 'Vobo AI · theme' })
    .setDescription('Pick an accent colour for embeds across the bot.')
    .setFooter({ text: `current: #${currentHex.replace('#', '').toUpperCase()}` });
}

export function buildThemeSelect(currentHex = config.accent) {
  const current = currentHex.replace('#', '').toUpperCase();
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('hub:theme:pick')
      .setPlaceholder('Choose an accent colour…')
      .addOptions(THEME_COLORS.map(c =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setValue(c.value)
          .setEmoji(c.emoji)
          .setDefault(c.value.toUpperCase() === current)
      )),
  );
}