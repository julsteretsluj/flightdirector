'use strict';

const { ChannelType } = require('discord.js');
const automod = require('../features/automod');
const { guildCommand } = require('../lib/command');

module.exports = {
  data: guildCommand('automod', 'Filter invites and spam, and slow the server during a raid.')
    .addSubcommand((sub) => sub
      .setName('config')
      .setDescription('Set the log channel and filters')
      .addChannelOption((option) => option
        .setName('log')
        .setDescription('Private channel for cases, edits, and deletions')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((option) => option.setName('invites').setDescription('Remove Discord invite links'))
      .addBooleanOption((option) => option.setName('spam').setDescription('Remove burst and repeated messages'))
      .addIntegerOption((option) => option
        .setName('raid')
        .setDescription('Joins in 20 seconds before an alert')
        .setMinValue(3)
        .setMaxValue(30))
      .addBooleanOption((option) => option.setName('auto_lockdown').setDescription('Apply slowmode automatically on a join spike')))
    .addSubcommand((sub) => sub.setName('lockdown').setDescription('Add 10 second slowmode to channels that have none'))
    .addSubcommand((sub) => sub.setName('unlock').setDescription('Remove slowmode added by a lockdown')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'config') return automod.configure(interaction);
    if (sub === 'lockdown') return automod.lockCommand(interaction);
    if (sub === 'unlock') return automod.unlockCommand(interaction);
    throw new Error(`Unknown automod subcommand ${sub}`);
  },
};
