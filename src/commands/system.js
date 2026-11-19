'use strict';

const system = require('../features/system');
const { guildCommand } = require('../lib/command');

module.exports = {
  data: guildCommand('system', 'Proxy messages and track who is fronting.')
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Name the system, or show it if you change nothing')
      .addStringOption((option) => option.setName('name').setDescription('System name, or none to clear').setMaxLength(80))
      .addStringOption((option) => option.setName('tag').setDescription('Short tag appended to proxied names').setMaxLength(20))
      .addStringOption((option) => option.setName('avatar').setDescription('Image URL, or none to clear').setMaxLength(512)))
    .addSubcommand((sub) => sub
      .setName('show')
      .setDescription('Show a system and who is fronting')
      .addUserOption((option) => option.setName('user').setDescription('Whose system to open')))
    .addSubcommand((sub) => sub
      .setName('autoproxy')
      .setDescription('Choose when untagged messages are proxied')
      .addStringOption((option) => option
        .setName('mode')
        .setDescription('When to proxy without a tag')
        .setRequired(true)
        .addChoices(
          { name: 'Off, tags only', value: 'off' },
          { name: 'When one headmate is fronting', value: 'front' },
          { name: 'Stay with the last headmate', value: 'latch' },
        )))
    .addSubcommand((sub) => sub
      .setName('delete')
      .setDescription('Delete your system in this server')
      .addBooleanOption((option) => option.setName('confirm').setDescription('Confirm the deletion').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('member-add')
      .setDescription('Add a headmate')
      .addStringOption((option) => option.setName('name').setDescription('Name shown on proxied messages').setRequired(true).setMaxLength(80))
      .addStringOption((option) => option.setName('prefix').setDescription('Text before the message, like jay:').setMaxLength(32))
      .addStringOption((option) => option.setName('suffix').setDescription('Text after the message, like ]').setMaxLength(32))
      .addStringOption((option) => option.setName('avatar').setDescription('Image URL').setMaxLength(512))
      .addStringOption((option) => option.setName('pronouns').setDescription('Pronouns').setMaxLength(40))
      .addStringOption((option) => option.setName('bio').setDescription('Short note').setMaxLength(300)))
    .addSubcommand((sub) => sub
      .setName('member-edit')
      .setDescription('Edit a headmate')
      .addStringOption((option) => option.setName('name').setDescription('Current name').setRequired(true).setMaxLength(80))
      .addStringOption((option) => option.setName('rename').setDescription('New name').setMaxLength(80))
      .addStringOption((option) => option.setName('prefix').setDescription('New prefix, or none to clear').setMaxLength(32))
      .addStringOption((option) => option.setName('suffix').setDescription('New suffix, or none to clear').setMaxLength(32))
      .addStringOption((option) => option.setName('avatar').setDescription('Image URL, or none to clear').setMaxLength(512))
      .addStringOption((option) => option.setName('pronouns').setDescription('Pronouns, or none to clear').setMaxLength(40))
      .addStringOption((option) => option.setName('bio').setDescription('Short note, or none to clear').setMaxLength(300)))
    .addSubcommand((sub) => sub
      .setName('member-remove')
      .setDescription('Remove a headmate')
      .addStringOption((option) => option.setName('name').setDescription('Name to remove').setRequired(true).setMaxLength(80)))
    .addSubcommand((sub) => sub
      .setName('members')
      .setDescription('List your headmates'))
    .addSubcommand((sub) => sub
      .setName('front')
      .setDescription('Mark who is fronting')
      .addStringOption((option) => option.setName('member').setDescription('Headmate name').setRequired(true).setMaxLength(80))
      .addBooleanOption((option) => option.setName('add').setDescription('Add beside whoever is already fronting')))
    .addSubcommand((sub) => sub
      .setName('unfront')
      .setDescription('Clear one headmate, or everyone if unnamed')
      .addStringOption((option) => option.setName('member').setDescription('Headmate to take off front').setMaxLength(80))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') return system.setup(interaction);
    if (sub === 'show') return system.show(interaction);
    if (sub === 'autoproxy') return system.autoproxy(interaction);
    if (sub === 'delete') return system.removeSystem(interaction);
    if (sub === 'member-add') return system.addMember(interaction);
    if (sub === 'member-edit') return system.editMember(interaction);
    if (sub === 'member-remove') return system.removeMember(interaction);
    if (sub === 'members') return system.listMembers(interaction);
    if (sub === 'front') return system.front(interaction);
    if (sub === 'unfront') return system.unfront(interaction);
    throw new Error(`Unknown system subcommand ${sub}`);
  },
};
