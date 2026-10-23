// language: JavaScript (ESM), file: handlers/buttonRouter.js
const routes = new Map();

export function register(prefix, handler) {
  routes.set(prefix, handler);
}

export async function dispatch(interaction) {
  if (!interaction.isButton()) return false;
  const [prefix] = interaction.customId.split(':');
  const handler = routes.get(prefix);
  if (!handler) return false;
  try { await handler(interaction); } catch (err) { console.error('[button] handler threw', err); }
  return true;
}

// Register cancel handler under 'sparx' prefix
register('sparx', async (interaction) => {
  if (interaction.customId !== 'sparx:cancel') return;
  
  const { getPlatform } = await import('../hub/sessionStore.js');
  const session = getPlatform(interaction.user.id, 'sparx');
  
  if (session?.activeSignal) {
    session.activeSignal.cancelled = true;
    await interaction.reply({ content: '⏹️ Stopping automation...', ephemeral: true });
  } else {
    await interaction.reply({ content: 'No active task to cancel.', ephemeral: true });
  }
});
