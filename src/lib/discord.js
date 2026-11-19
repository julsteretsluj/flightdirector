'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { UserError } = require('./errors');

const TEXT_TYPES = new Set([0, 5]);

function ephemeral(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

function humanize(error) {
  const code = error?.code ?? error?.rawError?.code;
  if (code === 50013) return 'I am missing permission to do that.';
  if (code === 50001) return 'I cannot see that channel.';
  if (code === 10008 || code === 10003) return 'That message or channel no longer exists.';
  if (code === 30005) return 'That member already has the maximum number of roles.';
  if (code === 30010) return 'That message already has the maximum number of reactions.';
  if (code === 10062) return 'Discord closed that interaction before I finished. Try again.';
  if (code === 50035) return 'Discord rejected part of that message. Check lengths, colors, and image URLs.';
  return null;
}

function sendableError(channel, me, { threads = false } = {}) {
  if (!channel || !channel.isTextBased?.() || channel.isDMBased?.()) return 'Choose a server text channel.';
  if (!TEXT_TYPES.has(channel.type) && !(threads && channel.isThread?.())) return 'Choose a server text channel.';
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel)) return 'I cannot see that channel.';
  if (!permissions.has(PermissionFlagsBits.SendMessages)) return 'I need permission to send messages there.';
  if (!permissions.has(PermissionFlagsBits.EmbedLinks)) return 'I need the Embed Links permission there.';
  return null;
}

function isStaff(member, settings) {
  if (!member) return false;
  const permissions = member.permissions;
  if (permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (permissions?.has(PermissionFlagsBits.ModerateMembers)) return true;
  if (settings?.staff_role_id && member.roles?.cache?.has(settings.staff_role_id)) return true;
  return false;
}

function roleAssignmentError(guild, role) {
  const me = guild.members.me;
  if (!me) return 'I am still starting. Try again in a moment.';
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return 'I need the Manage Roles permission.';
  if (role.id === guild.id) return 'The @everyone role cannot be assigned.';
  if (role.managed) return 'That role is managed by an integration, so I cannot hand it out.';
  if (role.position >= me.roles.highest.position) {
    return `Move my role above **${role.name}** in Server Settings, then try again.`;
  }
  return null;
}

async function resolveMessage(client, guildId, input, fallbackChannel) {
  const { parseMessageRef } = require('./parse');
  const ref = parseMessageRef(input);
  if (!ref) throw new UserError('Paste a message link, or the message ID if you are in that channel.');

  let channel = fallbackChannel;
  if (ref.channelId) {
    if (ref.guildId && ref.guildId !== guildId) throw new UserError('That message is from another server.');
    channel = await client.channels.fetch(ref.channelId).catch(() => null);
  }
  if (!channel || channel.guildId !== guildId || !channel.isTextBased?.()) {
    throw new UserError('I cannot find that message in this server.');
  }

  try {
    return await channel.messages.fetch(ref.messageId);
  } catch (error) {
    throw new UserError(humanize(error) || 'I cannot find that message. Check the link and that I can read the channel.');
  }
}

function messageLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function buttonEmoji(emoji) {
  if (!emoji) return null;
  const custom = String(emoji).trim().match(/^<(a)?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (custom) return { animated: Boolean(custom[1]), name: custom[2], id: custom[3], react: `${custom[2]}:${custom[3]}` };
  const unicode = String(emoji).trim();
  if (!unicode || unicode.length > 32) return null;
  return { name: unicode, react: unicode };
}

function sameEmoji(stored, emoji) {
  if (!stored || !emoji) return false;
  const custom = String(stored).match(/^<a?:[a-zA-Z0-9_]+:(\d+)>$/);
  if (custom) return emoji.id === custom[1];
  return emoji.name === stored || emoji.toString() === stored;
}

function requireManager(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new UserError('That needs the Manage Server permission.');
  }
}

module.exports = {
  ephemeral,
  humanize,
  sendableError,
  isStaff,
  roleAssignmentError,
  requireManager,
  resolveMessage,
  messageLink,
  buttonEmoji,
  sameEmoji,
};
