// language: JavaScript (ESM), file: hub/settingsModal.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
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

  const accent = new TextInputBuilder()
    .setCustomId('accent').setLabel('Theme accent hex')
    .setPlaceholder('00A8E1').setStyle(TextInputStyle.Short)
    .setRequired(false).setValue((current.accent ?? config.accent).replace('#', ''));

  return new ModalBuilder()
    .setCustomId('hub:settings:submit')
    .setTitle('Vobo AI settings')
    .addComponents(
      new ActionRowBuilder().addComponents(model),
      new ActionRowBuilder().addComponents(dm),
      new ActionRowBuilder().addComponents(accent),
    );
}

export function parseHubSettings(values) {
  const v = Object.fromEntries(values.fields.map(f => [f.customId, f.value?.trim()]));
  return {
    geminiModel: v.geminiModel || config.geminiDefault,
    dmPdf: (v.dmPdf ?? '').toLowerCase() !== 'no',
    accent: v.accent ? `#${v.accent.replace('#', '')}` : config.accent,
  };
}
