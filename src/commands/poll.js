'use strict';

const { ChannelType } = require('discord.js');
const { guildCommand } = require('../lib/command');
const polls = require('../features/polls');

module.exports = {
  data: guildCommand('poll', 'Open a poll and close it when you are done.')
    .addSubcommand((sub) => sub
      .setName('create')
      .setDescription('Post a poll')
      .addStringOption((option) => option
        .setName('question')
        .setDescription('The question')
        .setRequired(true)
        .setMaxLength(256))
      .addStringOption((option) => option
        .setName('options')
        .setDescription('Choices separated by |')
        .setRequired(true)
        .setMaxLength(1000))
      .addBooleanOption((option) => option
        .setName('multi')
        .setDescription('Let people pick more than one choice'))
      .addBooleanOption((option) => option
        .setName('anonymous')
        .setDescription('Hide who voted'))
      .addStringOption((option) => option
        .setName('duration')
        .setDescription('How long it stays open, like 30s, 10m, 2h, or 1d')
        .setMaxLength(8))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post it')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub
      .setName('end')
      .setDescription('Close a poll and freeze the results')
      .addStringOption((option) => option
        .setName('message')
        .setDescription('Poll message link, or its ID from this channel')
        .setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return polls.publishPoll(interaction);
    if (sub === 'end') return polls.endPoll(interaction);
    throw new Error(`Unknown poll subcommand ${sub}`);
  },
};
