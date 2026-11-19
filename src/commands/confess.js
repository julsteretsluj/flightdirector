'use strict';

const { ChannelType } = require('discord.js');
const { guildCommand } = require('../lib/command');
const confessions = require('../features/confessions');

module.exports = {
  data: guildCommand('confess', 'Anonymous confessions, with an optional review step.')
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Choose the confession channel, log, and review')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where approved confessions are posted')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addChannelOption((option) => option
        .setName('log')
        .setDescription('Private channel where author names are recorded')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((option) => option
        .setName('review')
        .setDescription('Hold confessions until a moderator approves them'))
      .addBooleanOption((option) => option
        .setName('clear-log')
        .setDescription('Remove the private log channel')))
    .addSubcommand((sub) => sub
      .setName('send')
      .setDescription('Write an anonymous confession')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') return confessions.configure(interaction);
    if (sub === 'send') return confessions.openComposer(interaction);
    throw new Error(`Unknown confess subcommand ${sub}`);
  },
};
