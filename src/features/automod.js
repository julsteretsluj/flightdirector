'use strict';

const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getSettings, saveSettings } = require('../db');
const store = require('../store');
const { UserError } = require('../lib/errors');
const { ephemeral, isStaff, sendableError } = require('../lib/discord');
const { hasInvite, spamVerdict } = require('../lib/guard');
const { markSilent } = require('../lib/silent');
const { sendLog } = require('./logger');

const history = new Map();
const strikes = new Map();
const joins = new Map();
const raidAlerts = new Map();

function noteMessage(guildId, userId, content, now) {
  const key = `${guildId}:${userId}`;
  const list = (history.get(key) || []).filter((entry) => now - entry.at < 20_000);
  const verdict = spamVerdict(list, content, now);
  list.push({ at: now, content });
  history.set(key, list);
  return verdict;
}

function noteStrike(guildId, userId, now) {
  const key = `${guildId}:${userId}`;
  const list = (strikes.get(key) || []).filter((at) => now - at < 10 * 60_000);
  list.push(now);
  strikes.set(key, list);
  return list.length;
}

async function punish(message, reason) {
  markSilent(message.id);
  await message.delete().catch(() => {});
  const settings = getSettings(message.guild.id);
  const count = noteStrike(message.guild.id, message.author.id, Date.now());
  let timedOut = false;
  if (count >= 3 && message.member?.moderatable) {
    await message.member.timeout(5 * 60_000, reason).then(() => { timedOut = true; }).catch(() => {});
  }
  const embed = new EmbedBuilder()
    .setColor(0xff9f0a)
    .setTitle('Automod')
    .setDescription(reason)
    .addFields(
      { name: 'Member', value: `<@${message.author.id}>`, inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
      { name: 'Action', value: timedOut ? 'Message removed and timed out for 5 minutes.' : 'Message removed.' },
    )
    .setTimestamp();
  if (settings.log_channel_id) await sendLog(message.guild, embed).catch((error) => console.error(error));
}

async function handleMessage(message) {
  if (!message.guild || message.author?.bot || message.webhookId) return false;
  if (store.getTicketByChannel(message.channelId)) return false;
  const settings = getSettings(message.guild.id);
  if (isStaff(message.member, settings)) return false;
  if (message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return false;

  const content = message.content || '';
  if (settings.automod_invites && hasInvite(content)) {
    await punish(message, 'Discord invite posted.');
    return true;
  }
  if (settings.automod_spam && (message.mentions.everyone || message.mentions.users.size > 5)) {
    const allowed = message.member?.permissions?.has(PermissionFlagsBits.MentionEveryone);
    if (!allowed) {
      await punish(message, message.mentions.everyone ? 'Tried to ping everyone.' : 'Too many mentions.');
      return true;
    }
  }
  if (settings.automod_spam && (content || message.attachments.size)) {
    const verdict = noteMessage(message.guild.id, message.author.id, content || '[attachment]', Date.now());
    if (verdict.burst || verdict.dupes) {
      await punish(message, verdict.dupes ? 'Repeated the same message.' : 'Sending messages too quickly.');
      return true;
    }
  }
  return false;
}

function noteJoin(guild, settings) {
  const now = Date.now();
  const list = (joins.get(guild.id) || []).filter((at) => now - at < 20_000);
  list.push(now);
  joins.set(guild.id, list);
  return list.length >= (settings.raid_limit || 8);
}

async function handleJoin(member) {
  if (member.user?.bot) return;
  const settings = getSettings(member.guild.id);
  if (!noteJoin(member.guild, settings)) return;
  const last = raidAlerts.get(member.guild.id) || 0;
  if (Date.now() - last < 2 * 60_000) return;
  raidAlerts.set(member.guild.id, Date.now());
  if (settings.auto_lockdown && !settings.lockdown) {
    await lockdown(member.guild).catch((error) => console.error(error));
  }
  const embed = new EmbedBuilder()
    .setColor(0xff3b30)
    .setTitle('Join spike')
    .setDescription(`${settings.raid_limit || 8} accounts joined within 20 seconds.`)
    .setFooter({ text: settings.auto_lockdown ? 'Slowmode was applied where it was previously off.' : 'Use /automod lockdown if you want slowmode on quiet channels.' })
    .setTimestamp();
  await sendLog(member.guild, embed).catch((error) => console.error(error));
}

async function lockdown(guild) {
  await guild.channels.fetch().catch(() => {});
  const changed = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) continue;
    if (channel.rateLimitPerUser) continue;
    if (!channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageChannels)) continue;
    await channel.setRateLimitPerUser(10, 'Lockdown');
    changed.push(channel.id);
  }
  saveSettings(guild.id, { lockdown: 1, lockdown_channels: JSON.stringify(changed) });
  return changed.length;
}

async function unlock(guild) {
  const settings = getSettings(guild.id);
  let ids = [];
  try { ids = JSON.parse(settings.lockdown_channels || '[]'); } catch { ids = []; }
  for (const id of ids) {
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (channel?.rateLimitPerUser === 10) await channel.setRateLimitPerUser(0, 'Lockdown ended').catch(() => {});
  }
  saveSettings(guild.id, { lockdown: 0, lockdown_channels: '[]' });
}

async function configure(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new UserError('You need Manage Server to change automod.');
  }
  const current = getSettings(interaction.guildId);
  const log = interaction.options.getChannel('log');
  const invites = interaction.options.getBoolean('invites');
  const spam = interaction.options.getBoolean('spam');
  const raid = interaction.options.getInteger('raid');
  const auto = interaction.options.getBoolean('auto_lockdown');
  if (log == null && invites == null && spam == null && raid == null && auto == null) {
    const embed = new EmbedBuilder()
      .setColor(0xff9f0a)
      .setTitle('Automod')
      .setDescription([
        `Log: ${current.log_channel_id ? `<#${current.log_channel_id}>` : 'not set'}`,
        `Invites: ${current.automod_invites ? 'on' : 'off'}`,
        `Spam: ${current.automod_spam ? 'on' : 'off'}`,
        `Join alert: ${current.raid_limit || 8} joins in 20 seconds`,
        `Auto lockdown: ${current.auto_lockdown ? 'on' : 'off'}`,
        `Lockdown: ${current.lockdown ? 'on' : 'off'}`,
      ].join('\n'));
    await interaction.reply({ embeds: [embed], flags: ephemeral().flags });
    return;
  }
  const patch = {};
  if (log) {
    const problem = sendableError(log, interaction.guild.members.me);
    if (problem) throw new UserError(problem);
    patch.log_channel_id = log.id;
  }
  if (invites != null) patch.automod_invites = invites ? 1 : 0;
  if (spam != null) patch.automod_spam = spam ? 1 : 0;
  if (raid != null) patch.raid_limit = raid;
  if (auto != null) patch.auto_lockdown = auto ? 1 : 0;
  const next = saveSettings(interaction.guildId, patch);
  await interaction.reply(ephemeral(
    `Log: ${next.log_channel_id ? `<#${next.log_channel_id}>` : 'not set'}. Invites ${next.automod_invites ? 'on' : 'off'}. Spam ${next.automod_spam ? 'on' : 'off'}.`,
  ));
}

async function lockCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new UserError('You need Manage Server to lock down the server.');
  }
  const count = await lockdown(interaction.guild);
  await interaction.reply(ephemeral(
    count
      ? `Slowmode of 10 seconds is on in ${count} channels that had none.`
      : 'No channels were changed. I may be missing Manage Channels, or slowmode was already set.',
  ));
}

async function unlockCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new UserError('You need Manage Server to end a lockdown.');
  }
  await unlock(interaction.guild);
  await interaction.reply(ephemeral('Removed the slowmode this lockdown added.'));
}

module.exports = {
  handleMessage,
  handleJoin,
  configure,
  lockCommand,
  unlockCommand,
};
