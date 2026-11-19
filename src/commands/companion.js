'use strict';

const companion = require('../features/companion');
const { guildCommand } = require('../lib/command');

const ACTIVITIES = [
  { name: 'Break', value: 'breaktime' },
  { name: 'Fetch', value: 'fetch' },
  { name: 'Hike', value: 'hike' },
  { name: 'Swim', value: 'swim' },
  { name: 'Visit', value: 'visit' },
  { name: 'Heal', value: 'heal' },
  { name: 'Stroll', value: 'stroll' },
  { name: 'Sing', value: 'sing' },
  { name: 'Draw', value: 'draw' },
  { name: 'Snooze', value: 'snooze' },
  { name: 'Dream', value: 'dream' },
  { name: 'Explore', value: 'explore' },
  { name: 'Manifest', value: 'manifest' },
];

module.exports = {
  data: guildCommand('companion', 'A companion to feed, play with, and take outside.')
    .addSubcommand((sub) => sub
      .setName('adopt')
      .setDescription('Take in a companion')
      .addStringOption((option) => option.setName('name').setDescription('Their name').setRequired(true).setMaxLength(24)))
    .addSubcommand((sub) => sub
      .setName('view')
      .setDescription('See a companion')
      .addUserOption((option) => option.setName('user').setDescription('Whose companion')))
    .addSubcommand((sub) => sub.setName('disown').setDescription('Say goodbye to your companion'))
    .addSubcommand((sub) => sub.setName('play').setDescription('Play. Raises happiness and lifetime'))
    .addSubcommand((sub) => sub.setName('feed').setDescription('Feed them. Needs food and some happiness'))
    .addSubcommand((sub) => sub
      .setName('playdate')
      .setDescription('A playdate for two companions')
      .addUserOption((option) => option.setName('user').setDescription('The other person').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('cozy')
      .setDescription('Get cozy with friends and their companions')
      .addUserOption((option) => option.setName('user').setDescription('A friend').setRequired(true))
      .addUserOption((option) => option.setName('user2').setDescription('Another friend'))
      .addUserOption((option) => option.setName('user3').setDescription('Another friend'))
      .addUserOption((option) => option.setName('user4').setDescription('Another friend'))
      .addUserOption((option) => option.setName('user5').setDescription('Another friend')))
    .addSubcommand((sub) => sub
      .setName('activity')
      .setDescription('Spend time with your companion')
      .addStringOption((option) => option
        .setName('kind')
        .setDescription('What to do')
        .setRequired(true)
        .addChoices(...ACTIVITIES))
      .addUserOption((option) => option.setName('user').setDescription('Required for visit, heal, stroll, dream, and manifest'))),
  execute: companion.execute,
};
