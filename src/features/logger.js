'use strict';

const { EmbedBuilder } = require('discord.js');
const { getSettings } = require('../db');
const { QUIET } = require('../lib/parse');

async function sendLog(guild, embed) {
  const settings = getSettings(guild.id);
  if (!settings.log_channel_id) return false;
  const channel = await guild.channels.fetch(settings.log_channel_id).catch(() => null);
  if (!channel?.isTextBased?.()) return false;
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  return true;
}

function clip(text) {
  const value = String(text || '').trim();
  if (!value) return 'Content not available.';
  return value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
}

async function handleDelete(message) {
  const { isSilent } = require('../lib/silent');
  if (isSilent(message.id)) return;
  if (message.partial) {
    try { message = await message.fetch(); } catch { /* already gone */ }
  }
  if (!message.guild || message.channelId === getSettings(message.guild.id).log_channel_id) return;
  if (message.author?.bot && !message.webhookId) return;
  const embed = new EmbedBuilder()
    .setColor(0xff3b30)
    .setTitle('Message deleted')
    .setDescription(clip(message.content))
    .addFields(
      { name: 'Author', value: message.author ? `<@${message.author.id}>` : 'Unknown', inline: true },
      { name: 'Channel', value: message.channelId ? `<#${message.channelId}>` : 'Unknown', inline: true },
    )
    .setTimestamp();
  await sendLog(message.guild, embed).catch((error) => console.error(error));
}

async function handleEdit(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  const settings = getSettings(newMessage.guild.id);
  if (newMessage.channelId === settings.log_channel_id) return;
  const embed = new EmbedBuilder()
    .setColor(QUIET)
    .setTitle('Message edited')
    .addFields(
      { name: 'Before', value: clip(oldMessage.content) },
      { name: 'After', value: clip(newMessage.content) },
      { name: 'Author', value: `<@${newMessage.author.id}>`, inline: true },
      { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true },
    )
    .setURL(newMessage.url)
    .setTimestamp();
  await sendLog(newMessage.guild, embed).catch((error) => console.error(error));
}

async function handleBulk(messages, channel) {
  if (!channel.guild) return;
  if (channel.id === getSettings(channel.guild.id).log_channel_id) return;
  const embed = new EmbedBuilder()
    .setColor(0xff3b30)
    .setTitle('Messages bulk deleted')
    .setDescription(`${messages.size} messages in <#${channel.id}>.`)
    .setTimestamp();
  await sendLog(channel.guild, embed).catch((error) => console.error(error));
}

module.exports = { sendLog, handleDelete, handleEdit, handleBulk };
