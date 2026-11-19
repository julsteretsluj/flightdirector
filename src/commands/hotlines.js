'use strict';

const hotlines = require('../features/hotlines');
const { guildCommand } = require('../lib/command');

module.exports = {
  data: guildCommand('hotlines', 'Crisis lines and directories.')
    .addSubcommand((sub) => sub.setName('online').setDescription('Directories of chat and local lines'))
    .addSubcommand((sub) => sub
      .setName('search')
      .setDescription('Look up a country')
      .addStringOption((option) => option.setName('country').setDescription('Country name').setRequired(true).setMaxLength(60))),
  execute: hotlines.execute,
};
