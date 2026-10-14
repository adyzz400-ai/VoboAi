// language: JavaScript (ESM), file: scripts/deployCommands.js
// *Run once after changing the slash command set: npm run deploy:commands*
import { REST, Routes } from 'discord.js';
import { config } from '../utils/config.js';
import { data as start } from '../commands/start.js';

const commands = [start.toJSON()];
const rest = new REST({ version: '10' }).setToken(config.discordToken);
const me = await rest.get(Routes.user('@me'));
await rest.put(Routes.applicationCommands(me.id), { body: commands });
console.log(`[commands] registered ${commands.length} globally for ${me.username}`);
