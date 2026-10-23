// language: JavaScript (ESM), file: handlers/buttonRouter.js
import { getPlatform } from '../hub/sessionStore.js';

const routes = new Map();

export function register(customId, handler) {
  routes.set(customId, handler);
}

export async function dispatch(interaction) {
  if (!interaction.isButton()) return false;
  const handler = routes.get(interaction.customId);
  if (!handler) return false;
  try { await handler(interaction); } catch (err) { console.error('[button] handler threw', err); }
  return true;
}

// Register cancel handler
register('sparx:cancel', async (interaction) => {
  const session = getPlatform(interaction.user.id, 'sparx');
  if (session?.activeSignal) {
    session.activeSignal.cancelled = true;
    await interaction.reply({ content: '️ Stopping automation...', ephemeral: true });
  } else {
    await interaction.reply({ content: 'No active task to cancel.', ephemeral: true });
  }
});
