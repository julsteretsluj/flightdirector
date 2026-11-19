'use strict';

const moderation = require('../features/moderation');
const { guildCommand } = require('../lib/command');

module.exports = {
  data: guildCommand('mod', 'Warn, time out, kick, or ban, and keep a case history.')
    .addSubcommand((sub) => sub
      .setName('warn')
      .setDescription('Record a warning')
      .addUserOption((option) => option.setName('user').setDescription('Who to warn').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(true).setMaxLength(400)))
    .addSubcommand((sub) => sub
      .setName('timeout')
      .setDescription('Time a member out')
      .addUserOption((option) => option.setName('user').setDescription('Who to time out').setRequired(true))
      .addStringOption((option) => option.setName('length').setDescription('How long, like 10m, 1h, or 1d').setRequired(true).setMaxLength(6))
      .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(true).setMaxLength(400)))
    .addSubcommand((sub) => sub
      .setName('kick')
      .setDescription('Kick a member')
      .addUserOption((option) => option.setName('user').setDescription('Who to kick').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(true).setMaxLength(400)))
    .addSubcommand((sub) => sub
      .setName('ban')
      .setDescription('Ban a member')
      .addUserOption((option) => option.setName('user').setDescription('Who to ban').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(true).setMaxLength(400))
      .addIntegerOption((option) => option.setName('delete_days').setDescription('Days of their messages to delete').setMinValue(0).setMaxValue(7)))
    .addSubcommand((sub) => sub
      .setName('unban')
      .setDescription('Remove a ban by user ID')
      .addStringOption((option) => option.setName('user').setDescription('The user ID').setRequired(true).setMaxLength(20))
      .addStringOption((option) => option.setName('reason').setDescription('Why').setMaxLength(400)))
    .addSubcommand((sub) => sub
      .setName('history')
      .setDescription('Show recent cases for a member')
      .addUserOption((option) => option.setName('user').setDescription('Whose cases to show').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'warn') return moderation.warn(interaction);
    if (sub === 'timeout') return moderation.timeout(interaction);
    if (sub === 'kick') return moderation.kick(interaction);
    if (sub === 'ban') return moderation.ban(interaction);
    if (sub === 'unban') return moderation.unban(interaction);
    if (sub === 'history') return moderation.history(interaction);
    throw new Error(`Unknown mod subcommand ${sub}`);
  },
};
