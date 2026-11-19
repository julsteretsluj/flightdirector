'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const cash = require('../features/cash');
const { guildCommand } = require('../lib/command');

function channelOption() {
  return (option) => option
    .setName('channel')
    .setDescription('Text channel')
    .setRequired(true)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
}

module.exports = {
  data: guildCommand('cashset', 'Currency symbol, payouts, drops, and resets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('show').setDescription('Show the currency settings'))
    .addSubcommand((sub) => sub
      .setName('symbol')
      .setDescription('Change the currency symbol')
      .addStringOption((option) => option.setName('symbol').setDescription('Emoji or short text').setRequired(true).setMaxLength(32)))
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Currency given the first time someone joins')
      .addIntegerOption((option) => option.setName('amount').setDescription('Amount, or 0 for none').setRequired(true).setMinValue(0).setMaxValue(1_000_000)))
    .addSubcommand((sub) => sub
      .setName('onleave')
      .setDescription('Keep or delete currency when someone leaves')
      .addStringOption((option) => option
        .setName('mode')
        .setDescription('What happens to their balance and inventory')
        .setRequired(true)
        .addChoices(
          { name: 'Keep it', value: 'save' },
          { name: 'Delete it', value: 'delete' },
        )))
    .addSubcommand((sub) => sub
      .setName('pet')
      .setDescription('Pet cooldown and payout')
      .addIntegerOption((option) => option.setName('cooldown').setDescription('Minutes').setMinValue(1).setMaxValue(1440))
      .addIntegerOption((option) => option.setName('min').setDescription('Minimum payout').setMinValue(1).setMaxValue(1_000_000))
      .addIntegerOption((option) => option.setName('max').setDescription('Maximum payout').setMinValue(1).setMaxValue(1_000_000)))
    .addSubcommand((sub) => sub
      .setName('snuggle')
      .setDescription('Snuggle cooldown and payout')
      .addIntegerOption((option) => option.setName('cooldown').setDescription('Minutes').setMinValue(1).setMaxValue(1440))
      .addIntegerOption((option) => option.setName('min').setDescription('Minimum payout').setMinValue(1).setMaxValue(1_000_000))
      .addIntegerOption((option) => option.setName('max').setDescription('Maximum payout').setMinValue(1).setMaxValue(1_000_000)))
    .addSubcommand((sub) => sub
      .setName('cake')
      .setDescription('Marshmallow cooldown and payout')
      .addIntegerOption((option) => option.setName('cooldown').setDescription('Minutes').setMinValue(1).setMaxValue(1440))
      .addIntegerOption((option) => option.setName('amount').setDescription('Payout per click').setMinValue(1).setMaxValue(1_000_000)))
    .addSubcommand((sub) => sub
      .setName('bet')
      .setDescription('Minimum and maximum bet')
      .addIntegerOption((option) => option.setName('min').setDescription('Minimum bet').setMinValue(1).setMaxValue(1_000_000_000))
      .addIntegerOption((option) => option.setName('max').setDescription('Maximum bet').setMinValue(1).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('transfer')
      .setDescription('Gift limits and tax percent')
      .addIntegerOption((option) => option.setName('min').setDescription('Minimum gift').setMinValue(1).setMaxValue(1_000_000_000))
      .addIntegerOption((option) => option.setName('max').setDescription('Maximum gift').setMinValue(1).setMaxValue(1_000_000_000))
      .addIntegerOption((option) => option.setName('tax').setDescription('Percent kept from the gift').setMinValue(0).setMaxValue(90)))
    .addSubcommand((sub) => sub
      .setName('pick')
      .setDescription('How drops pay out')
      .addIntegerOption((option) => option.setName('min').setDescription('Minimum each pick can take').setMinValue(1).setMaxValue(1_000_000))
      .addIntegerOption((option) => option.setName('max').setDescription('Maximum each pick can take').setMinValue(1).setMaxValue(1_000_000))
      .addStringOption((option) => option
        .setName('speed')
        .setDescription('How often a drop appears')
        .addChoices(
          { name: 'Very fast', value: 'veryfast' },
          { name: 'Fast', value: 'fast' },
          { name: 'Medium', value: 'medium' },
          { name: 'Slow', value: 'slow' },
          { name: 'Very slow', value: 'veryslow' },
        ))
      .addStringOption((option) => option
        .setName('type')
        .setDescription('Who can pick up one drop')
        .addChoices(
          { name: 'Several people', value: 'multiple' },
          { name: 'First person', value: 'first' },
        ))
      .addStringOption((option) => option
        .setName('hard')
        .setDescription('Whether a code is required')
        .addChoices(
          { name: 'No code', value: 'open' },
          { name: 'Requires a code', value: 'code' },
        )))
    .addSubcommand((sub) => sub
      .setName('pick-channel')
      .setDescription('Add or remove a channel that spawns drops')
      .addChannelOption(channelOption())
      .addStringOption((option) => option
        .setName('action')
        .setDescription('Add or remove the channel')
        .setRequired(true)
        .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })))
    .addSubcommand((sub) => sub
      .setName('confirm')
      .setDescription('Ask before a shop purchase')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Ask for confirmation').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('ids')
      .setDescription('Show item ids in the shop')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Show ids').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('gambling')
      .setDescription('Allow or block bets')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Allow bets').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('grant')
      .setDescription('Add currency to someone')
      .addUserOption((option) => option.setName('user').setDescription('Who receives it').setRequired(true))
      .addIntegerOption((option) => option.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('take')
      .setDescription('Remove currency from someone')
      .addUserOption((option) => option.setName('user').setDescription('Whose balance').setRequired(true))
      .addIntegerOption((option) => option.setName('amount').setDescription('Amount to remove').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('reset')
      .setDescription('Clear balances, inventories, the shop, or events')
      .addStringOption((option) => option
        .setName('target')
        .setDescription('What to clear')
        .setRequired(true)
        .addChoices(
          { name: 'One balance', value: 'user-balance' },
          { name: 'One inventory', value: 'user-inventory' },
          { name: 'Every balance', value: 'balances' },
          { name: 'Every inventory', value: 'inventories' },
          { name: 'The shop', value: 'shop' },
          { name: 'Running events', value: 'events' },
        ))
      .addUserOption((option) => option.setName('user').setDescription('Required for one balance or inventory'))
      .addBooleanOption((option) => option.setName('confirm').setDescription('Required for a server-wide reset'))),
  execute: cash.executeSettings,
};
