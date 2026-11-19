'use strict';

const { MessageFlags } = require('discord.js');
const { isUserError } = require('../lib/errors');
const { humanize } = require('../lib/discord');
const reactionRoles = require('../features/reaction-roles');
const polls = require('../features/polls');
const confessions = require('../features/confessions');
const profile = require('../features/profile');
const focus = require('../features/focus');
const tickets = require('../features/tickets');
const shop = require('../features/shop');
const cash = require('../features/cash');
const verify = require('../features/verify');

async function report(interaction, text) {
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({ content: text });
    return;
  }
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
}

async function handleInteraction(interaction, client) {
  if (interaction.isAutocomplete()) {
    try {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      else await interaction.respond([]);
    } catch (error) {
      console.error(interaction.commandName, error);
      if (!interaction.responded) await interaction.respond([]).catch(() => {});
    }
    return;
  }

  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith('rr:')) return reactionRoles.handleButton(interaction);
      if (id.startsWith('poll:')) return polls.handleButton(interaction);
      if (id.startsWith('confess:')) return confessions.handleButton(interaction);
      if (id.startsWith('focus:') || id.startsWith('checkin:')) return focus.handleButton(interaction);
      if (id.startsWith('ticket:')) return tickets.handleButton(interaction);
      if (id.startsWith('shop:')) return shop.handleButton(interaction);
      if (id.startsWith('cake:') || id.startsWith('drop:') || id.startsWith('event:')) return cash.handleButton(interaction);
      if (id.startsWith('verify:')) return verify.handleButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id === 'profile:edit') return profile.handleModal(interaction);
      if (id === 'confess:compose' || id.startsWith('confess:rmodal:')) return confessions.handleModal(interaction);
      if (id.startsWith('focus:intent-modal:')) return focus.handleModal(interaction);
      if (id === 'ticket:compose') return tickets.openFromModal(interaction);
      if (id === 'verify:phrase') return verify.handleModal(interaction);
    }
  } catch (error) {
    console.error(interaction.commandName || interaction.customId, error);
    const text = isUserError(error) ? error.message : (humanize(error) || 'Something went wrong running that.');
    try {
      await report(interaction, text);
    } catch (replyError) {
      console.error('Could not report an interaction error', replyError);
    }
  }
}

module.exports = { handleInteraction };
