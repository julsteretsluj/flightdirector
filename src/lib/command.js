'use strict';

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');

function guildCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild);
}

module.exports = { guildCommand };
