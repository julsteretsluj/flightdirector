'use strict';

const focus = require('../features/focus');
const { guildCommand } = require('../lib/command');

module.exports = {
  data: guildCommand('focus', 'Run a shared work sprint or post a small check-in.')
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Start a work and break timer in this channel')
      .addIntegerOption((option) => option.setName('work').setDescription('Work minutes').setMinValue(1).setMaxValue(90))
      .addIntegerOption((option) => option.setName('break').setDescription('Break minutes').setMinValue(1).setMaxValue(30))
      .addStringOption((option) => option.setName('intention').setDescription('What you are sitting down to do').setMaxLength(140)))
    .addSubcommand((sub) => sub.setName('join').setDescription('Join the sprint in this channel'))
    .addSubcommand((sub) => sub.setName('leave').setDescription('Leave the sprint without stopping it'))
    .addSubcommand((sub) => sub
      .setName('intention')
      .setDescription('Name the small task you are doing')
      .addStringOption((option) => option.setName('text').setDescription('The task').setRequired(true).setMaxLength(140)))
    .addSubcommand((sub) => sub.setName('done').setDescription('Mark your intention done'))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Stop the sprint'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the current sprint'))
    .addSubcommand((sub) => sub
      .setName('checkin')
      .setDescription('Post a small intention without a timer')
      .addStringOption((option) => option.setName('text').setDescription('What you are about to do').setRequired(true).setMaxLength(200)))
    .addSubcommand((sub) => sub.setName('tasks').setDescription('List your open check-ins')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'start') return focus.start(interaction);
    if (sub === 'join') return focus.join(interaction);
    if (sub === 'leave') return focus.leave(interaction);
    if (sub === 'intention') return focus.intention(interaction);
    if (sub === 'done') return focus.done(interaction);
    if (sub === 'stop') return focus.stop(interaction);
    if (sub === 'status') return focus.status(interaction);
    if (sub === 'checkin') return focus.checkin(interaction);
    if (sub === 'tasks') return focus.tasks(interaction);
    throw new Error(`Unknown focus subcommand ${sub}`);
  },
};
