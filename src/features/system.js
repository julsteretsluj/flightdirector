'use strict';

const { EmbedBuilder, PermissionFlagsBits, WebhookClient } = require('discord.js');
const db = require('../db');
const store = require('../store');
const { UserError } = require('../lib/errors');
const { INK, parseHttpUrl, clearedText, neutralizePings } = require('../lib/parse');
const { ephemeral } = require('../lib/discord');
const { matchProxy, proxyName } = require('../lib/proxy-match');
const { markSilent } = require('../lib/silent');

function cleanTag(value) {
  if (value == null) return undefined;
  const text = String(value);
  if (text.trim() === '-' || text.trim().toLowerCase() === 'none') return null;
  const trimmed = text.trim();
  if (trimmed.length > 32) throw new UserError('Tags need to be 32 characters or fewer.');
  return trimmed;
}

function ensureTags(prefix, suffix) {
  if (!prefix && !suffix) return;
  if ((prefix || '').length + (suffix || '').length < 2) {
    throw new UserError('A tag needs at least two characters, like `jay:` or `[` and `]`.');
  }
}

function assertUniqueTag(guildId, userId, prefix, suffix, exceptId) {
  if (!prefix && !suffix) return;
  const taken = store.listHeadmates(guildId, userId).find((member) => {
    if (exceptId && member.id === exceptId) return false;
    return (member.tag_prefix || '') === (prefix || '') && (member.tag_suffix || '') === (suffix || '');
  });
  if (taken) throw new UserError(`Those tags are already used by **${taken.name}**.`);
}

function renderSystem(user, system, members, fronts) {
  const frontIds = new Set(fronts.map((member) => member.id));
  const lines = members.map((member) => {
    const tags = [member.tag_prefix, member.tag_suffix].filter(Boolean).join(' … ');
    const bits = [
      frontIds.has(member.id) ? 'front' : null,
      member.pronouns,
      tags ? `\`${tags}\`` : 'no tag',
    ].filter(Boolean);
    return `**${member.name}**\n${bits.join(' · ')}`;
  });
  const embed = new EmbedBuilder()
    .setColor(INK)
    .setTitle(system?.name || 'System')
    .setFooter({ text: `@${user.username}` });
  if (system?.avatar_url) embed.setThumbnail(system.avatar_url);
  const about = [];
  if (system?.tag) about.push(`Tag: ${system.tag}`);
  about.push(`Autoproxy: ${system?.autoproxy || 'off'}`);
  if (fronts.length) about.push(`Fronting: ${fronts.map((member) => member.name).join(', ')}`);
  if (lines.length) about.push(lines.join('\n\n'));
  else about.push('No headmates yet. Add one with `/system member-add`.');
  embed.setDescription(about.join('\n\n').slice(0, 4096));
  return embed;
}

async function setup(interaction) {
  const name = interaction.options.getString('name');
  const tag = interaction.options.getString('tag');
  const avatar = parseHttpUrl(interaction.options.getString('avatar'), { allowClear: true });
  if (avatar && typeof avatar === 'object') throw new UserError(avatar.error);
  if (name == null && tag == null && avatar === undefined) {
    const system = store.getSystem(interaction.guildId, interaction.user.id);
    const members = store.listHeadmates(interaction.guildId, interaction.user.id);
    const fronts = store.listFronts(interaction.guildId, interaction.user.id);
    await interaction.reply({
      embeds: [renderSystem(interaction.user, system, members, fronts)],
      flags: ephemeral().flags,
    });
    return;
  }
  const patch = {};
  if (name != null) patch.name = clearedText(name, null);
  if (tag != null) patch.tag = clearedText(tag, null);
  if (avatar !== undefined) patch.avatar_url = avatar;
  const system = store.saveSystem(interaction.guildId, interaction.user.id, patch);
  const members = store.listHeadmates(interaction.guildId, interaction.user.id);
  const fronts = store.listFronts(interaction.guildId, interaction.user.id);
  await interaction.reply({
    content: 'Saved your system.',
    embeds: [renderSystem(interaction.user, system, members, fronts)],
    flags: ephemeral().flags,
  });
}

async function show(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const system = store.getSystem(interaction.guildId, user.id);
  const members = store.listHeadmates(interaction.guildId, user.id);
  const fronts = store.listFronts(interaction.guildId, user.id);
  if (!system && !members.length) {
    const mine = user.id === interaction.user.id;
    throw new UserError(mine
      ? 'You have not set up a system here. Start with `/system setup` and `/system member-add`.'
      : 'That person has not set up a system in this server.');
  }
  const payload = { embeds: [renderSystem(user, system, members, fronts)] };
  if (user.id !== interaction.user.id) payload.flags = ephemeral().flags;
  await interaction.reply(payload);
}

async function autoproxy(interaction) {
  const mode = interaction.options.getString('mode', true);
  store.saveSystem(interaction.guildId, interaction.user.id, { autoproxy: mode });
  const note = {
    off: 'Messages proxy only when you use a tag.',
    front: 'Untagged messages proxy when exactly one headmate is fronting.',
    latch: 'Untagged messages stay with the last headmate who spoke.',
  }[mode];
  await interaction.reply(ephemeral(note));
}

async function removeSystem(interaction) {
  if (!interaction.options.getBoolean('confirm')) throw new UserError('Nothing was deleted.');
  const removed = store.deleteSystem(interaction.guildId, interaction.user.id);
  await interaction.reply(ephemeral(removed ? 'Deleted your system in this server.' : 'There was no system to delete.'));
}

async function addMember(interaction) {
  const name = interaction.options.getString('name', true).trim();
  if (!name || name.length > 80) throw new UserError('Use a name of 80 characters or fewer.');
  if (store.findHeadmate(interaction.guildId, interaction.user.id, name)) {
    throw new UserError(`**${name}** is already in your system. Edit them with \`/system member-edit\`.`);
  }
  const prefix = cleanTag(interaction.options.getString('prefix')) || null;
  const suffix = cleanTag(interaction.options.getString('suffix')) || null;
  ensureTags(prefix, suffix);
  assertUniqueTag(interaction.guildId, interaction.user.id, prefix, suffix);
  const avatar = parseHttpUrl(interaction.options.getString('avatar'));
  if (avatar && typeof avatar === 'object') throw new UserError(avatar.error);
  store.saveSystem(interaction.guildId, interaction.user.id, {});
  const member = store.addHeadmate({
    user_id: interaction.user.id,
    guild_id: interaction.guildId,
    name,
    avatar_url: typeof avatar === 'string' ? avatar : null,
    pronouns: interaction.options.getString('pronouns')?.trim() || null,
    bio: interaction.options.getString('bio')?.trim() || null,
    tag_prefix: prefix,
    tag_suffix: suffix,
  });
  const how = member.tag_prefix || member.tag_suffix
    ? `Tag: \`${member.tag_prefix || ''}\` text \`${member.tag_suffix || ''}\``
    : 'No tag yet. They can still be set as front, or you can add a tag with `/system member-edit`.';
  await interaction.reply(ephemeral(`Added **${member.name}**. ${how}`));
}

async function editMember(interaction) {
  const current = store.findHeadmate(interaction.guildId, interaction.user.id, interaction.options.getString('name', true));
  if (!current) throw new UserError('I could not find that headmate. Check `/system members`.');
  const rename = interaction.options.getString('rename');
  const nextName = rename == null ? current.name : clearedText(rename, current.name);
  if (!nextName) throw new UserError('A headmate needs a name.');
  if (nextName !== current.name && store.findHeadmate(interaction.guildId, interaction.user.id, nextName)) {
    throw new UserError(`**${nextName}** is already in your system.`);
  }
  const prefix = interaction.options.getString('prefix');
  const suffix = interaction.options.getString('suffix');
  const avatar = parseHttpUrl(interaction.options.getString('avatar'), { allowClear: true });
  if (avatar && typeof avatar === 'object') throw new UserError(avatar.error);
  const pronouns = interaction.options.getString('pronouns');
  const bio = interaction.options.getString('bio');
  if ([rename, prefix, suffix, pronouns, bio].every((value) => value == null) && avatar === undefined) {
    throw new UserError('Change a name, tag, avatar, pronouns, or bio.');
  }
  const tagPrefix = prefix == null ? current.tag_prefix : cleanTag(prefix);
  const tagSuffix = suffix == null ? current.tag_suffix : cleanTag(suffix);
  ensureTags(tagPrefix, tagSuffix);
  assertUniqueTag(interaction.guildId, interaction.user.id, tagPrefix, tagSuffix, current.id);
  store.updateHeadmate(current.id, {
    name: nextName,
    tag_prefix: tagPrefix,
    tag_suffix: tagSuffix,
    avatar_url: avatar === undefined ? current.avatar_url : avatar,
    pronouns: pronouns == null ? current.pronouns : clearedText(pronouns, current.pronouns),
    bio: bio == null ? current.bio : clearedText(bio, current.bio),
  });
  await interaction.reply(ephemeral(`Updated **${nextName}**.`));
}

async function removeMember(interaction) {
  const member = store.findHeadmate(interaction.guildId, interaction.user.id, interaction.options.getString('name', true));
  if (!member) throw new UserError('I could not find that headmate.');
  store.deleteHeadmate(member.id);
  await interaction.reply(ephemeral(`Removed **${member.name}**.`));
}

async function listMembers(interaction) {
  const members = store.listHeadmates(interaction.guildId, interaction.user.id);
  if (!members.length) throw new UserError('No headmates yet. Add one with `/system member-add`.');
  const lines = members.map((member) => {
    const tags = `${member.tag_prefix || ''}${member.tag_suffix ? ` … ${member.tag_suffix}` : ''}`;
    return `**${member.name}**${member.pronouns ? ` · ${member.pronouns}` : ''}${tags ? ` · \`${tags}\`` : ''}`;
  });
  await interaction.reply(ephemeral(lines.join('\n').slice(0, 1900)));
}

async function front(interaction) {
  const member = store.findHeadmate(interaction.guildId, interaction.user.id, interaction.options.getString('member', true));
  if (!member) throw new UserError('I could not find that headmate.');
  const add = Boolean(interaction.options.getBoolean('add'));
  const fronts = store.setFront(interaction.guildId, interaction.user.id, member.id, { add });
  store.saveSystem(interaction.guildId, interaction.user.id, {});
  await interaction.reply(ephemeral(`Fronting: ${fronts.map((person) => `**${person.name}**`).join(', ')}.`));
}

async function unfront(interaction) {
  const name = interaction.options.getString('member');
  if (!name) {
    store.clearFront(interaction.guildId, interaction.user.id);
    await interaction.reply(ephemeral('Cleared the front.'));
    return;
  }
  const member = store.findHeadmate(interaction.guildId, interaction.user.id, name);
  if (!member) throw new UserError('I could not find that headmate.');
  const fronts = store.clearFront(interaction.guildId, interaction.user.id, member.id);
  const text = fronts.length
    ? `Fronting: ${fronts.map((person) => `**${person.name}**`).join(', ')}.`
    : 'No one is marked as fronting.';
  await interaction.reply(ephemeral(text));
}

function parentChannel(channel) {
  if (channel.isThread?.()) return channel.parent;
  return channel;
}

async function webhookFor(channel) {
  const parent = parentChannel(channel);
  if (!parent) throw new Error('Missing parent channel');
  const saved = store.getWebhook(parent.id);
  if (saved) return saved;
  const existing = (await parent.fetchWebhooks()).find((hook) => hook.token && hook.name === '0gbot-proxy');
  const created = existing || await parent.createWebhook({ name: '0gbot-proxy', reason: 'Proxy messages for this channel' });
  store.saveWebhook(parent.id, parent.guildId, created.id, created.token);
  return store.getWebhook(parent.id);
}

async function handleProxy(message) {
  if (!message.guild || message.author?.bot || message.webhookId) return false;
  const content = message.content || '';
  if (!content && message.attachments.size === 0) return false;
  if (content.startsWith('\\')) return false;

  const members = store.listHeadmates(message.guild.id, message.author.id);
  if (!members.length) return false;
  const system = store.getSystem(message.guild.id, message.author.id);
  const matched = matchProxy(content, members);
  let member = matched?.member || null;
  let inner = matched?.inner || '';
  if (!member && system?.autoproxy === 'front') {
    const fronts = store.listFronts(message.guild.id, message.author.id);
    if (fronts.length === 1) {
      member = fronts[0];
      inner = content;
    }
  } else if (!member && system?.autoproxy === 'latch' && system.latch_member_id) {
    member = store.getHeadmate(system.latch_member_id);
    inner = content;
  }
  if (!member) return false;
  if (!inner && message.attachments.size === 0) return false;

  const parent = parentChannel(message.channel);
  const me = message.guild.members.me;
  const canDelete = message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages);
  const canHook = parent?.permissionsFor(me)?.has(PermissionFlagsBits.ManageWebhooks);
  if (!canDelete || !canHook) {
    const notice = await message.reply({
      content: 'I need Manage Messages and Manage Webhooks here before I can proxy that.',
      allowedMentions: { parse: [] },
    }).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), 6000).unref?.();
    return true;
  }

  let hookRow;
  try {
    hookRow = await webhookFor(message.channel);
  } catch (error) {
    console.error(error);
    return false;
  }

  const payload = {
    content: neutralizePings(inner).slice(0, 2000) || undefined,
    username: proxyName(member, system),
    avatarURL: member.avatar_url || system?.avatar_url || undefined,
    allowedMentions: { parse: [], repliedUser: false },
    threadId: message.channel.isThread?.() ? message.channel.id : undefined,
  };
  const files = [...message.attachments.values()].slice(0, 10).map((attachment) => ({
    attachment: attachment.url,
    name: attachment.name || 'file',
  }));
  if (files.length) payload.files = files;
  if (message.reference?.messageId) {
    payload.reply = { messageReference: message.reference.messageId, failIfNotExists: false };
  }

  const hook = new WebhookClient({ id: hookRow.webhook_id, token: hookRow.webhook_token });
  try {
    try {
      await hook.send(payload);
    } catch (error) {
      if (error?.code === 10015) {
        store.deleteWebhook(parent.id);
        hookRow = await webhookFor(message.channel);
        const fresh = new WebhookClient({ id: hookRow.webhook_id, token: hookRow.webhook_token });
        await fresh.send({ ...payload, avatarURL: undefined });
        fresh.destroy();
      } else if (error?.code === 50035) {
        await hook.send({ ...payload, username: 'Member', avatarURL: undefined });
      } else {
        throw error;
      }
    }
  } finally {
    hook.destroy();
  }

  store.saveSystem(message.guild.id, message.author.id, { latch_member_id: member.id });
  markSilent(message.id);
  await message.delete().catch(() => {});
  return true;
}

module.exports = {
  setup,
  show,
  autoproxy,
  removeSystem,
  addMember,
  editMember,
  removeMember,
  listMembers,
  front,
  unfront,
  handleProxy,
};
