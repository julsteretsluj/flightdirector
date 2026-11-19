'use strict';

const { ChannelType } = require('discord.js');
const tickets = require('../features/tickets');
const { guildCommand } = require('../lib/command');

module.exports = {
  data: guildCommand('ticket', 'Open a private channel with staff.')
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Choose the category and the staff role')
      .addChannelOption((option) => option
        .setName('category')
        .setDescription('Category that will hold tickets')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption((option) => option
        .setName('staff')
        .setDescription('Role that can read every ticket')
        .setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('panel')
      .setDescription('Post a button that opens a ticket')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post the panel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub
      .setName('close')
      .setDescription('Close the ticket you are in')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') return tickets.setup(interaction);
    if (sub === 'panel') return tickets.panel(interaction);
    if (sub === 'close') return tickets.close(interaction);
    throw new Error(`Unknown ticket subcommand ${sub}`);
  },
};
