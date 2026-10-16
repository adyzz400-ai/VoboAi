// language: JavaScript (ESM), file: index.js
// Entry point: HTTP healthcheck, Discord client, hub autopost, interaction router.
import 'dotenv/config';
import http from 'node:http';
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { config } from './utils/config.js';
import { log, warn, error } from './utils/logger.js';
import * as startCmd from './commands/start.js';
import { buildStartModal } from './hub/startModal.js';
import { buildHubSettingsModal, parseHubSettings, buildThemeEmbed, buildThemeSelect } from './hub/settingsModal.js';
import { buildTutorialEmbed } from './hub/tutorial.js';
import { dispatch as dispatchButton, register } from './handlers/buttonRouter.js';
import { handleStartModal } from './handlers/startModalSubmit.js';
import { buildHubEmbed, buildHubButtons } from './hub/panel.js';
import { eduHandlers } from './platforms/educake/handlers.js';
import { autopostHub } from './hub/autopost.js';
import { getTheme, setTheme } from './hub/sessionStore.js';

// Render healthcheck
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(404); res.end();
}).listen(PORT, () => log(`[http] listening on :${PORT}`));

// hub button routes
register('hub', async (interaction) => {
  const [, action] = interaction.customId.split(':');

  if (action === 'start')    return interaction.showModal(buildStartModal());
  if (action === 'settings') return interaction.showModal(buildHubSettingsModal());
  if (action === 'tutorial') return interaction.reply({ embeds: [buildTutorialEmbed()], flags: MessageFlags.Ephemeral });
  if (action === 'back') {
    const hex = getTheme(interaction.user.id);
    return interaction.update({ embeds: [buildHubEmbed(hex)], components: [buildHubButtons()] });
  }

  if (action === 'theme') {
    const current = getTheme(interaction.user.id);
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [buildThemeEmbed(current)],
      components: [buildThemeSelect(current)],
    });
  }

  warn(`[hub] unhandled action ${action}`);
});

// educake button/modal routes
register('edu', async (interaction) => {
  const handler = eduHandlers[interaction.customId];
  if (!handler) { warn(`[edu] no handler for ${interaction.customId}`); return; }
  return handler(interaction);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  log(`[bot] logged in as ${c.user.tag} · ${c.guilds.cache.size} guild(s)`);
  warn('[sessions] in-memory store - sessions drop on redeploy');
  try { await autopostHub(c); }
  catch (err) { error('[autopost] failed', err); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'start') {
      return startCmd.execute(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'hub:start:submit') return handleStartModal(interaction);

      if (interaction.customId === 'hub:settings:submit') {
        const parsed = parseHubSettings(interaction);
        log('[hub] settings saved', parsed);
        return interaction.reply({
          flags: MessageFlags.Ephemeral,
          embeds: [{
            color: parseInt(config.accent.replace('#', ''), 16),
            author: { name: 'Vobo AI' },
            description: 'Settings saved.',
          }],
        });
      }

      if (interaction.customId in eduHandlers) return eduHandlers[interaction.customId](interaction);
      warn(`[modal] unhandled ${interaction.customId}`);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'edu:quiz')          return eduHandlers['edu:quiz'](interaction);
      if (interaction.customId === 'edu:login:variant') return eduHandlers['edu:login:variant'](interaction);

      if (interaction.customId === 'hub:theme:pick') {
        const hex = interaction.values[0];
        setTheme(interaction.user.id, hex);
        log(`[theme] ${interaction.user.id} -> ${hex}`);

        // update the ephemeral picker in place
        await interaction.update({ embeds: [buildThemeEmbed(hex)], components: [] });

        // if the source message is the hub panel, refresh its colour live
        try {
          const freshHex = getTheme(interaction.user.id);
          await interaction.message.edit({
            embeds: [buildHubEmbed(freshHex)],
            components: [buildHubButtons()],
          }).catch(() => {});
        } catch { /* interaction.message may not be the hub panel */ }
        return;
      }

      warn(`[select] unhandled ${interaction.customId}`);
      return;
    }

    if (interaction.isButton()) return dispatchButton(interaction);
  } catch (err) {
    error('[interaction] unhandled', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something broke - check the logs.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(config.discordToken);