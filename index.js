// language: JavaScript (ESM), file: index.js
import 'dotenv/config';
import http from 'node:http';
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { config } from './utils/config.js';
import { log, warn, error } from './utils/logger.js';
import * as startCmd from './commands/start.js';
import { buildStartModal } from './hub/startModal.js';
import { buildHubSettingsModal, parseHubSettings } from './hub/settingsModal.js';
import { buildTutorialEmbed } from './hub/tutorial.js';
import { dispatch as dispatchButton, register } from './handlers/buttonRouter.js';
import { handleStartModal } from './handlers/startModalSubmit.js';
import { buildHubEmbed, buildHubButtons } from './hub/panel.js';
import { eduHandlers } from './platforms/educake/handlers.js';

const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(404); res.end();
}).listen(PORT, () => log(`[http] listening on :${PORT}`));

register('hub', async (interaction) => {
  const [, action] = interaction.customId.split(':');
  if (action === 'start')    return interaction.showModal(buildStartModal());
  if (action === 'settings') return interaction.showModal(buildHubSettingsModal());
  if (action === 'tutorial') return interaction.reply({ embeds: [buildTutorialEmbed()], flags: MessageFlags.Ephemeral });
  if (action === 'back')     return interaction.update({ embeds: [buildHubEmbed()], components: [buildHubButtons()] });
});

register('edu', async (interaction) => {
  const handler = eduHandlers[interaction.customId];
  if (!handler) { warn(`[edu] no handler for ${interaction.customId}`); return; }
  return handler(interaction);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  log(`[bot] logged in as ${c.user.tag} · ${c.guilds.cache.size} guild(s)`);
  warn('[sessions] in-memory store — sessions drop on redeploy');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'start') {
      return startCmd.execute(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'hub:start:submit')    return handleStartModal(interaction);
      if (interaction.customId === 'hub:settings:submit') {
        const parsed = parseHubSettings(interaction);
        log('[hub] settings saved', parsed);
        return interaction.reply({
          flags: MessageFlags.Ephemeral,
          embeds: [{ color: parseInt(parsed.accent.replace('#', ''), 16),
            author: { name: 'Vobo AI' }, description: 'Settings saved.' }],
        });
      }
      if (interaction.customId in eduHandlers) return eduHandlers[interaction.customId](interaction);
      warn(`[modal] unhandled ${interaction.customId}`);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'edu:quiz') {
      return eduHandlers['edu:quiz'](interaction);
    }

    if (interaction.isButton()) return dispatchButton(interaction);
  } catch (err) {
    error('[interaction] unhandled', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something broke — check the logs.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(config.discordToken).catch((err) => {
  console.error('[bot] Discord login failed:', err);
});