'use strict';

const fs = require('fs');
const path = require('path');

function loadCommands() {
  const dir = path.join(__dirname, 'commands');
  const commands = new Map();
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js'))) {
    const command = require(path.join(dir, file));
    if (!command?.data?.name || typeof command.execute !== 'function') {
      throw new Error(`Command file ${file} must export data and execute.`);
    }
    commands.set(command.data.name, command);
  }
  return commands;
}

module.exports = { loadCommands };
