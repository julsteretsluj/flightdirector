'use strict';

const { MessageFlags } = require('discord.js');
const eco = require('../store-economy');
const { UserError } = require('../lib/errors');
const { requireManager, sendableError } = require('../lib/discord');
const { memberContext, renderFilled } = require('../lib/templates');

const KINDS = {
  greet: ['greet_channel_id', 'greet_message', 'Welcome'],
  leave: ['leave_channel_id', 'leave_message', 'Goodbye'],
  boost: ['boost_channel_id', 'boost_message', 'Boost'],
};

async function sendKind(member, kind) {
  const [channelKey, messageKey] = KINDS[kind];
  const settings = eco.settings(member.guild.id);
  const template = settings[messageKey];
  const channelId = settings[channelKey];
  if (!template || !channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased?.()) return;
  const rendered = renderFilled(member.guild.id, template, memberContext(member));
  if (!rendered.content && !rendered.embeds.length) return;
  await channel.send({
    content: rendered.content || undefined,
    embeds: rendered.embeds,
    allowedMentions: { users: [member.id], parse: [] },
  }).catch((error) => console.error(error));
}

function handleJoin(member) {
  return sendKind(member, 'greet');
}

function handleLeave(member) {
  return sendKind(member, 'leave');
}

function handleBoost(member) {
  return sendKind(member, 'boost');
}

async function execute(interaction) {
  requireManager(interaction);
  const sub = interaction.options.getSubcommand();
  if (sub === 'preview') {
    const kind = interaction.options.getString('kind', true);
    const settings = eco.settings(interaction.guildId);
    const template = settings[KINDS[kind][1]];
    if (!template) throw new UserError(`No ${kind} message is set.`);
    const rendered = renderFilled(interaction.guildId, template, memberContext(interaction.member));
    if (!rendered.content && !rendered.embeds.length) throw new UserError('That message renders empty.');
    await interaction.reply({
      content: rendered.content || undefined,
      embeds: rendered.embeds,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { users: [interaction.user.id], parse: [] },
    });
    return;
  }
  if (sub === 'clear') {
    const kind = interaction.options.getString('kind', true);
    const [channelKey, messageKey, label] = KINDS[kind];
    eco.saveSettings(interaction.guildId, { [channelKey]: null, [messageKey]: null });
    await interaction.reply({ content: `Cleared the ${label.toLowerCase()} message.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const kind = sub.startsWith('leave') ? 'leave' : (sub.startsWith('boost') ? 'boost' : 'greet');
  const [channelKey, messageKey, label] = KINDS[kind];
  if (sub.endsWith('channel')) {
    const channel = interaction.options.getChannel('channel', true);
    const error = sendableError(channel, interaction.guild.members.me);
    if (error) throw new UserError(error);
    eco.saveSettings(interaction.guildId, { [channelKey]: channel.id });
    await interaction.reply({ content: `${label} messages will post in ${channel}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const message = interaction.options.getString('message', true).trim();
  if (!message) throw new UserError('Write a message.');
  eco.saveSettings(interaction.guildId, { [messageKey]: message.slice(0, 1500) });
  await interaction.reply({
    content: `Saved the ${label.toLowerCase()} message. Set a channel with \`/greet ${kind === 'greet' ? 'channel' : `${kind}-channel`}\` if you have not.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute, handleJoin, handleLeave, handleBoost };
