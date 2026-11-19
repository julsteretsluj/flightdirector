'use strict';

const { ChannelType } = require('discord.js');
const verify = require('../features/verify');
const { guildCommand } = require('../lib/command');

module.exports = {
  data: guildCommand('verify', 'Gate the server behind a verified role.')
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Choose the verified role and the gate')
      .addRoleOption((option) => option.setName('role').setDescription('Role given when someone verifies').setRequired(true))
      .addRoleOption((option) => option.setName('hold').setDescription('Role for people who have not verified yet'))
      .addStringOption((option) => option.setName('phrase').setDescription('Phrase they must type. Use - to use a button only').setMaxLength(80))
      .addIntegerOption((option) => option.setName('age').setDescription('Minimum account age in hours. 0 turns it off').setMinValue(0).setMaxValue(720))
      .addStringOption((option) => option.setName('message').setDescription('Panel text. Use - to restore the default').setMaxLength(1000))
      .addBooleanOption((option) => option.setName('clear-hold').setDescription('Remove the hold role')))
    .addSubcommand((sub) => sub
      .setName('panel')
      .setDescription('Post the verify button')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post it')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((option) => option.setName('message').setDescription('Panel text. Use - to restore the default').setMaxLength(1000)))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the current verification setup'))
    .addSubcommand((sub) => sub
      .setName('grant')
      .setDescription('Verify someone without the button')
      .addUserOption((option) => option.setName('user').setDescription('Who to verify').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Take verification away')
      .addUserOption((option) => option.setName('user').setDescription('Who to unverify').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') return verify.setup(interaction);
    if (sub === 'panel') return verify.panel(interaction);
    if (sub === 'status') return verify.status(interaction);
    if (sub === 'grant') return verify.grant(interaction);
    if (sub === 'remove') return verify.remove(interaction);
    throw new Error(`Unknown verify subcommand ${sub}`);
  },
};
