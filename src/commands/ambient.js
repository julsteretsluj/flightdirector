'use strict';

const ambient = require('../features/ambient');
const { guildCommand } = require('../lib/command');

module.exports = {
  data: guildCommand('ambient', 'Play quiet generated noise in a voice channel.')
    .addSubcommand((sub) => sub.setName('join').setDescription('Play in the voice channel you are in'))
    .addSubcommand((sub) => sub.setName('leave').setDescription('Stop and disconnect')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'join') return ambient.join(interaction);
    if (sub === 'leave') return ambient.leave(interaction);
    throw new Error(`Unknown ambient subcommand ${sub}`);
  },
};
