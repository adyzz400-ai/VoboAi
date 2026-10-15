// language: JavaScript (ESM), file: hub/autopost.js
import { ChannelType } from 'discord.js';
import { buildHubEmbed, buildHubButtons } from './panel.js';
import { log, warn } from '../utils/logger.js';

const HUB_FOOTER_PREFIX = 'Vobo AI · v';

export async function autopostHub(client) {
  const channelId = process.env.HUB_CHANNEL_ID;
  if (!channelId) { warn('[autopost] HUB_CHANNEL_ID not set - skipping hub autopost'); return; }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    warn(`[autopost] channel ${channelId} not found or not a text channel`);
    return;
  }

  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (recent) {
    const existing = recent.find(m =>
      m.author.id === client.user.id &&
      m.embeds?.length > 0 &&
      (m.embeds[0].footer?.text ?? '').startsWith(HUB_FOOTER_PREFIX)
    );
    if (existing) {
      log(`[autopost] hub panel already exists (msg ${existing.id}) - not reposting`);
      return;
    }
  }

  const msg = await channel.send({ embeds: [buildHubEmbed()], components: [buildHubButtons()] });
  log(`[autopost] posted hub panel to #${channel.name} (msg ${msg.id})`);
}