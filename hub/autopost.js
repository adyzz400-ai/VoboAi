// language: JavaScript (ESM), file: hub/autopost.js
import { ChannelType } from 'discord.js';
import { buildHubEmbed, buildHubButtons } from './panel.js';
import { getTheme } from './sessionStore.js';
import { log, warn } from '../utils/logger.js';

export async function autopostHub(client) {
  const channelId = process.env.HUB_CHANNEL_ID;
  if (!channelId) { warn('[autopost] HUB_CHANNEL_ID not set'); return; }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) { warn('[autopost] channel ' + channelId + ' not found'); return; }
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    warn('[autopost] channel is not a text channel'); return;
  }

  const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (recent) {
    const stale = recent.filter(m => m.author.id === client.user.id && m.embeds && m.embeds.length > 0);
    if (stale.size > 0) {
      log('[autopost] removing ' + stale.size + ' stale bot embed(s)');
      for (const m of stale.values()) {
        try { await m.delete(); } catch (e) { /* ignore */ }
      }
    }
  }

  const hex = getTheme('');
  const msg = await channel.send({ embeds: [buildHubEmbed(hex)], components: [buildHubButtons()] });
  log('[autopost] posted hub panel (msg ' + msg.id + ')');
}