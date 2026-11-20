'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const greet = require('../features/greet');
const { guildCommand } = require('../lib/command');

function messageOption(description) {
  return (option) => option.setName('message').setDescription(description).setRequired(true).setMaxLength(1500);
}

function channelOption() {
  return (option) => option
    .setName('channel')
    .setDescription('Where to post')
    .setRequired(true)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
}

const kinds = [
  { name: 'Welcome', value: 'greet' },
  { name: 'Goodbye', value: 'leave' },
  { name: 'Boost', value: 'boost' },
];

module.exports = {
  data: guildCommand('greet', 'Welcome, goodbye, and boost messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub
      .setName('message')
      .setDescription('Set the welcome message')
      .addStringOption(messageOption('Supports {user}, {user_name}, {newline}, and {embed:name}')))
    .addSubcommand((sub) => sub
      .setName('channel')
      .setDescription('Channel for welcome messages')
      .addChannelOption(channelOption()))
    .addSubcommand((sub) => sub
      .setName('leave-message')
      .setDescription('Set the goodbye message')
      .addStringOption(messageOption('Supports {username}, {user_name}, {newline}, and {embed:name}')))
    .addSubcommand((sub) => sub
      .setName('leave-channel')
      .setDescription('Channel for goodbye messages')
      .addChannelOption(channelOption()))
    .addSubcommand((sub) => sub
      .setName('boost-message')
      .setDescription('Set the boost message')
      .addStringOption(messageOption('Supports {user}, {user_name}, {newline}, and {embed:name}')))
    .addSubcommand((sub) => sub
      .setName('boost-channel')
      .setDescription('Channel for boost messages')
      .addChannelOption(channelOption()))
    .addSubcommand((sub) => sub
      .setName('preview')
      .setDescription('Preview a message as yourself')
      .addStringOption((option) => option.setName('kind').setDescription('Which message').setRequired(true).addChoices(...kinds)))
    .addSubcommand((sub) => sub
      .setName('clear')
      .setDescription('Clear a message and its channel')
      .addStringOption((option) => option.setName('kind').setDescription('Which message').setRequired(true).addChoices(...kinds))),
  execute: greet.execute,
};
