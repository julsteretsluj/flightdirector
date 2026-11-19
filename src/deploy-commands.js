'use strict';

const { REST, Routes } = require('discord.js');
const { token, clientId, guildId } = require('./config');
const { loadCommands } = require('./load-commands');

const body = [...loadCommands().values()].map((command) => command.data.toJSON());
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      console.log(`Registered ${body.length} commands in guild ${guildId}.`);
      return;
    }
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`Registered ${body.length} global commands. They can take up to an hour to appear.`);
  } catch (error) {
    console.error('Could not register commands.', error);
    process.exit(1);
  }
})();
