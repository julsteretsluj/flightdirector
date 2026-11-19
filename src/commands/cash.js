'use strict';

const { ChannelType } = require('discord.js');
const cash = require('../features/cash');
const { guildCommand } = require('../lib/command');

function itemOption() {
  return (option) => option
    .setName('item')
    .setDescription('Item from your inventory')
    .setRequired(true)
    .setMaxLength(32)
    .setAutocomplete(true);
}

module.exports = {
  data: guildCommand('cash', 'Earn, give, drop, and gamble server currency.')
    .addSubcommand((sub) => sub
      .setName('balance')
      .setDescription('Check a balance')
      .addUserOption((option) => option.setName('user').setDescription('Whose balance')))
    .addSubcommand((sub) => sub
      .setName('pet')
      .setDescription('Pet for currency')
      .addUserOption((option) => option.setName('user').setDescription('Give the earnings to someone else'))
      .addBooleanOption((option) => option.setName('remind').setDescription('Remind you when it is ready')))
    .addSubcommand((sub) => sub
      .setName('snuggle')
      .setDescription('Snuggle for currency')
      .addUserOption((option) => option.setName('user').setDescription('Give the earnings to someone else'))
      .addBooleanOption((option) => option.setName('remind').setDescription('Remind you when it is ready')))
    .addSubcommand((sub) => sub.setName('clickcake').setDescription('Click a marshmallow for currency'))
    .addSubcommand((sub) => sub
      .setName('coinflip')
      .setDescription('Flip a coin, with an optional bet')
      .addStringOption((option) => option
        .setName('guess')
        .setDescription('Required if you bet')
        .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }))
      .addIntegerOption((option) => option.setName('bet').setDescription('Amount to wager').setMinValue(1).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('dice')
      .setDescription('Roll 1–100. Over 64 pays, over 90 pays more, 100 pays most')
      .addIntegerOption((option) => option.setName('bet').setDescription('Amount to wager').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('slots')
      .setDescription('Spin three icons')
      .addIntegerOption((option) => option.setName('bet').setDescription('Amount to wager').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('leaderboard')
      .setDescription('Richest balances')
      .addIntegerOption((option) => option.setName('page').setDescription('Page number').setMinValue(1)))
    .addSubcommand((sub) => sub
      .setName('give')
      .setDescription('Give currency to someone')
      .addUserOption((option) => option.setName('user').setDescription('Who receives it').setRequired(true))
      .addIntegerOption((option) => option.setName('amount').setDescription('Amount you pay').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('give-item')
      .setDescription('Give an item, if it can be gifted')
      .addUserOption((option) => option.setName('user').setDescription('Who receives it').setRequired(true))
      .addStringOption(itemOption())
      .addIntegerOption((option) => option.setName('amount').setDescription('How many').setMinValue(1).setMaxValue(100)))
    .addSubcommand((sub) => sub
      .setName('drop')
      .setDescription('Drop currency in this channel for others to pick up')
      .addIntegerOption((option) => option.setName('amount').setDescription('Amount to drop').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('pick')
      .setDescription('Pick up a drop in this channel')
      .addStringOption((option) => option.setName('code').setDescription('Code, if the drop asked for one').setMaxLength(8)))
    .addSubcommand((sub) => sub
      .setName('event-start')
      .setDescription('Post a button that pays currency once')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post it')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addIntegerOption((option) => option.setName('amount').setDescription('Currency each person receives').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000))
      .addStringOption((option) => option.setName('label').setDescription('Button label').setMaxLength(80))
      .addStringOption((option) => option.setName('description').setDescription('Message above the button').setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('event-end')
      .setDescription('Close the currency event in a channel')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel with the event')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),
  autocomplete: cash.autocomplete,
  execute: cash.execute,
};
