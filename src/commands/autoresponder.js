'use strict';

const { PermissionFlagsBits } = require('discord.js');
const autoresponder = require('../features/autoresponder');
const { guildCommand } = require('../lib/command');

const modes = [
  { name: 'Contains', value: 'contains' },
  { name: 'Exact', value: 'exact' },
  { name: 'Starts with', value: 'startswith' },
];

function triggerOption() {
  return (option) => option.setName('trigger').setDescription('Phrase to match').setRequired(true).setMaxLength(80);
}

module.exports = {
  data: guildCommand('autoresponder', 'Reply when a message matches a phrase.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Add a reply')
      .addStringOption(triggerOption())
      .addStringOption((option) => option.setName('reply').setDescription('What to send. {user} and {embed:name} work').setRequired(true).setMaxLength(1000))
      .addStringOption((option) => option.setName('match').setDescription('How the phrase matches').addChoices(...modes)))
    .addSubcommand((sub) => sub
      .setName('reply')
      .setDescription('Change a reply')
      .addStringOption(triggerOption())
      .addStringOption((option) => option.setName('reply').setDescription('New reply').setRequired(true).setMaxLength(1000)))
    .addSubcommand((sub) => sub
      .setName('match')
      .setDescription('Change how a phrase matches')
      .addStringOption(triggerOption())
      .addStringOption((option) => option.setName('mode').setDescription('Match mode').setRequired(true).addChoices(...modes)))
    .addSubcommand((sub) => sub
      .setName('show')
      .setDescription('Show one autoresponder')
      .addStringOption(triggerOption()))
    .addSubcommand((sub) => sub.setName('list').setDescription('List autoresponders'))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Remove an autoresponder')
      .addStringOption(triggerOption())),
  execute: autoresponder.execute,
};
