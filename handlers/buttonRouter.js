// language: JavaScript (ESM), file: handlers/buttonRouter.js
const routes = new Map();
export function register(prefix, handler) { routes.set(prefix, handler); }
export async function dispatch(interaction) {
  if (!interaction.isButton()) return false;
  const [prefix] = interaction.customId.split(':');
  const handler = routes.get(prefix);
  if (!handler) return false;
  try { await handler(interaction); } catch (err) { console.error('[button] handler threw', err); }
  return true;
}
