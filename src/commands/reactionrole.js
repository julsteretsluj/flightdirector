'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { guildCommand } = require('../lib/command');
const roles = require('../features/reaction-roles');

module.exports = {
  data: guildCommand('reactionrole', 'Buttons or reactions that hand out roles.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) => sub
      .setName('panel')
      .setDescription('Post a new role panel')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post the panel')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((option) => option
        .setName('title')
        .setDescription('Panel title')
        .setMaxLength(256))
      .addStringOption((option) => option
        .setName('description')
        .setDescription('Text above the roles')
        .setMaxLength(1500))
      .addStringOption((option) => option
        .setName('mode')
        .setDescription('How members pick a role')
        .addChoices(
          { name: 'Buttons', value: 'button' },
          { name: 'Reactions', value: 'reaction' },
        ))
      .addBooleanOption((option) => option
        .setName('exclusive')
        .setDescription('Allow only one role from this panel'))
      .addStringOption((option) => option
        .setName('color')
        .setDescription('Hex color like #007AFF')
        .setMaxLength(20)))
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Add a role to a panel')
      .addStringOption((option) => option
        .setName('message')
        .setDescription('Panel message link, or its ID from this channel')
        .setRequired(true))
      .addRoleOption((option) => option
        .setName('role')
        .setDescription('Role to hand out')
        .setRequired(true))
      .addStringOption((option) => option
        .setName('emoji')
        .setDescription('Emoji for the button or reaction')
        .setMaxLength(80))
      .addStringOption((option) => option
        .setName('label')
        .setDescription('Button label. Defaults to the role name')
        .setMaxLength(80))
      .addStringOption((option) => option
        .setName('style')
        .setDescription('Button color')
        .addChoices(
          { name: 'Gray', value: 'Secondary' },
          { name: 'Blurple', value: 'Primary' },
          { name: 'Green', value: 'Success' },
          { name: 'Red', value: 'Danger' },
        )))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Remove a role from a panel')
      .addStringOption((option) => option
        .setName('message')
        .setDescription('Panel message link, or its ID from this channel')
        .setRequired(true))
      .addRoleOption((option) => option
        .setName('role')
        .setDescription('Role to remove')
        .setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('delete')
      .setDescription('Delete a panel and its message')
      .addStringOption((option) => option
        .setName('message')
        .setDescription('Panel message link, or its ID from this channel')
        .setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('List role panels in this server')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') return roles.createPanel(interaction);
    if (sub === 'add') return roles.addOption(interaction);
    if (sub === 'remove') return roles.removeOption(interaction);
    if (sub === 'delete') return roles.deletePanel(interaction);
    if (sub === 'list') return roles.listPanels(interaction);
    throw new Error(`Unknown reactionrole subcommand ${sub}`);
  },
};
