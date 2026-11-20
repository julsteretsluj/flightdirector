'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const db = require('../db');
const { UserError } = require('../lib/errors');
const { ACCENT, parseColor, chunk } = require('../lib/parse');
const {
  ephemeral,
  sendableError,
  roleAssignmentError,
  resolveMessage,
  messageLink,
  buttonEmoji,
  sameEmoji,
  humanize,
} = require('../lib/discord');
const { rolePresets } = require('../lib/role-presets');

const STYLES = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

function renderPanel(panel, options, guild) {
  const lines = [];
  if (panel.description) lines.push(panel.description);
  if (panel.exclusive) lines.push('You can hold one role from this panel.');
  if (panel.mode === 'reaction') {
    if (options.length) {
      lines.push(options.map((option) => {
        const role = guild?.roles?.cache?.get(option.role_id);
        return `${option.emoji || '•'}  ${option.label || role?.name || 'Role'}`;
      }).join('\n'));
    } else {
      lines.push('No roles yet. Add some with `/reactionrole add`.');
    }
  } else if (!options.length) {
    lines.push('No roles yet. Add some with `/reactionrole add`.');
  }

  const embed = new EmbedBuilder()
    .setColor(panel.color ?? ACCENT)
    .setTitle(panel.title || 'Roles')
    .setDescription(lines.join('\n\n').slice(0, 4096));

  const components = panel.mode === 'button'
    ? chunk(options.map((option) => {
      const button = new ButtonBuilder()
        .setCustomId(`rr:${option.id}`)
        .setLabel(option.label.slice(0, 80))
        .setStyle(STYLES[option.style] || ButtonStyle.Secondary);
      const emoji = buttonEmoji(option.emoji);
      if (emoji) button.setEmoji(emoji.id ? { id: emoji.id, name: emoji.name, animated: emoji.animated } : emoji.name);
      return button;
    }), 5).map((row) => new ActionRowBuilder().addComponents(row))
    : [];

  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

async function refreshPanel(panel, guild) {
  const channel = await guild.client.channels.fetch(panel.channel_id);
  const message = await channel.messages.fetch(panel.message_id);
  const options = db.panelOptions(panel.id);
  await message.edit(renderPanel(panel, options, guild));
  return { message, options };
}

async function createPanel(interaction) {
  const channel = interaction.options.getChannel('channel', true);
  const problem = sendableError(channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);

  const title = (interaction.options.getString('title') || 'Roles').trim();
  const description = interaction.options.getString('description')?.trim() || null;
  const mode = interaction.options.getString('mode') || 'button';
  const exclusive = Boolean(interaction.options.getBoolean('exclusive'));
  const color = parseColor(interaction.options.getString('color'));
  if (color && typeof color === 'object') throw new UserError(color.error);
  await interaction.deferReply({ flags: ephemeral().flags });

  const draft = {
    title,
    description,
    color: color ?? ACCENT,
    mode,
    exclusive,
  };
  const message = await channel.send(renderPanel(draft, [], interaction.guild));
  db.createPanel({
    guild_id: interaction.guildId,
    channel_id: channel.id,
    message_id: message.id,
    title,
    description,
    color: draft.color,
    mode,
    exclusive,
  });

  const link = messageLink(interaction.guildId, channel.id, message.id);
  await interaction.editReply(
    `Panel posted in ${channel}.\nAdd a role with \`/reactionrole add\` and this link:\n${link}`,
  );
}

async function addOption(interaction) {
  const message = await resolveMessage(
    interaction.client,
    interaction.guildId,
    interaction.options.getString('message', true),
    interaction.channel,
  );
  const panel = db.getPanelByMessage(message.id);
  if (!panel || panel.guild_id !== interaction.guildId) throw new UserError('That message is not a reaction-role panel.');

  const options = db.panelOptions(panel.id);
  if (options.length >= 20) throw new UserError('A panel can hold 20 roles.');

  const role = interaction.options.getRole('role', true);
  const hierarchy = roleAssignmentError(interaction.guild, role);
  if (hierarchy) throw new UserError(hierarchy);
  if (options.some((option) => option.role_id === role.id)) throw new UserError('That role is already on the panel.');

  const emojiInput = interaction.options.getString('emoji');
  const emoji = emojiInput ? buttonEmoji(emojiInput) : null;
  if (emojiInput && !emoji) throw new UserError('Use a unicode emoji, or a custom emoji from this server like `<:name:id>`.');
  if (panel.mode === 'reaction' && !emoji) throw new UserError('Reaction panels need an emoji for each role.');
  if (emoji && options.some((option) => option.emoji === (emojiInput || '').trim())) {
    throw new UserError('That emoji is already used on this panel.');
  }

  const style = interaction.options.getString('style') || 'Secondary';
  if (!STYLES[style]) throw new UserError('Pick a button style.');
  const label = (interaction.options.getString('label') || role.name).trim().slice(0, 80);
  if (!label) throw new UserError('Give the button a label.');
  await interaction.deferReply({ flags: ephemeral().flags });

  const option = db.addPanelOption({
    panel_id: panel.id,
    role_id: role.id,
    emoji: emojiInput ? emojiInput.trim() : null,
    label,
    style,
  });

  try {
    if (panel.mode === 'reaction') await message.react(emoji.react);
    await message.edit(renderPanel(panel, db.panelOptions(panel.id), interaction.guild));
  } catch (error) {
    db.deletePanelOption(panel.id, role.id);
    if (panel.mode === 'reaction') {
      const reaction = message.reactions.cache.find((entry) => sameEmoji(emojiInput.trim(), entry.emoji));
      if (reaction) await reaction.users.remove(interaction.client.user.id).catch(() => {});
    }
    throw error;
  }

  await interaction.editReply(`Added **${label}** for ${role}.`);
  return option;
}

async function removeOption(interaction) {
  const message = await resolveMessage(
    interaction.client,
    interaction.guildId,
    interaction.options.getString('message', true),
    interaction.channel,
  );
  const panel = db.getPanelByMessage(message.id);
  if (!panel) throw new UserError('That message is not a reaction-role panel.');
  const role = interaction.options.getRole('role', true);
  const existing = db.panelOptions(panel.id).find((option) => option.role_id === role.id);
  if (!existing) throw new UserError('That role is not on the panel.');
  await interaction.deferReply({ flags: ephemeral().flags });

  db.deletePanelOption(panel.id, role.id);
  if (panel.mode === 'reaction' && existing.emoji) {
    const reaction = message.reactions.cache.find((entry) => sameEmoji(existing.emoji, entry.emoji));
    if (reaction) await reaction.users.remove(interaction.client.user.id).catch(() => {});
  }
  await message.edit(renderPanel(panel, db.panelOptions(panel.id), interaction.guild));
  await interaction.editReply(`Removed ${role} from the panel.`);
}

async function deletePanel(interaction) {
  const message = await resolveMessage(
    interaction.client,
    interaction.guildId,
    interaction.options.getString('message', true),
    interaction.channel,
  );
  const panel = db.getPanelByMessage(message.id);
  if (!panel) throw new UserError('That message is not a reaction-role panel.');
  await interaction.deferReply({ flags: ephemeral().flags });
  db.deletePanel(panel.id);
  await message.delete().catch(() => {});
  await interaction.editReply('Panel removed.');
}

async function ensureRole(guild, name) {
  const exact = guild.roles.cache.find((role) => role.name === name);
  if (exact) return exact;
  const folded = guild.roles.cache.find((role) => role.name.toLowerCase() === name.toLowerCase());
  if (folded) {
    if (folded.name !== name) await folded.setName(name, 'Lowercase neurotype preset');
    return folded;
  }
  return guild.roles.create({
    name,
    permissions: [],
    mentionable: false,
    reason: 'Neurotype reaction role preset',
  });
}

async function postPreset(interaction) {
  const key = interaction.options.getString('preset', true);
  const preset = rolePresets[key];
  if (!preset) throw new UserError('That preset is not on this bot.');
  const channel = interaction.options.getChannel('channel', true);
  const problem = sendableError(channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);
  if (preset.roles.length > 20) throw new UserError('A panel can hold 20 roles.');
  await interaction.deferReply({ flags: ephemeral().flags });

  await interaction.guild.roles.fetch();
  const ready = [];
  for (const entry of preset.roles) {
    let role;
    try {
      role = await ensureRole(interaction.guild, entry.name);
    } catch (error) {
      throw new UserError(humanize(error) || `I could not create **${entry.name}**.`);
    }
    const blocked = roleAssignmentError(interaction.guild, role);
    if (blocked) throw new UserError(blocked);
    ready.push({ ...entry, role });
  }

  const draft = {
    title: preset.title,
    description: preset.description,
    color: preset.color,
    mode: 'reaction',
    exclusive: false,
  };
  const message = await channel.send(renderPanel(draft, [], interaction.guild));
  const panel = db.createPanel({
    guild_id: interaction.guildId,
    channel_id: channel.id,
    message_id: message.id,
    title: preset.title,
    description: preset.description,
    color: preset.color,
    mode: 'reaction',
    exclusive: 0,
  });

  try {
    for (const entry of ready) {
      db.addPanelOption({
        panel_id: panel.id,
        role_id: entry.role.id,
        emoji: entry.emoji,
        label: entry.name,
        style: 'Secondary',
      });
      const emoji = buttonEmoji(entry.emoji);
      await message.react(emoji.react);
    }
    await message.edit(renderPanel(panel, db.panelOptions(panel.id), interaction.guild));
  } catch (error) {
    db.deletePanel(panel.id);
    await message.delete().catch(() => {});
    throw new UserError(humanize(error) || 'I could not finish that panel.');
  }

  const link = messageLink(interaction.guildId, channel.id, message.id);
  await interaction.editReply(`Posted **${preset.title}** in ${channel} with ${ready.length} reactions.\n${link}`);
}

async function listPanels(interaction) {
  const panels = db.listPanels(interaction.guildId);
  if (!panels.length) {
    await interaction.reply(ephemeral('No panels yet. Create one with `/reactionrole panel`.'));
    return;
  }
  const lines = panels.slice(0, 15).map((panel) => {
    const count = db.panelOptions(panel.id).length;
    const link = messageLink(panel.guild_id, panel.channel_id, panel.message_id);
    const kind = panel.mode === 'reaction' ? 'reactions' : 'buttons';
    const exclusive = panel.exclusive ? ' · one role' : '';
    const title = (panel.title || 'Roles').replace(/\s+/g, ' ').slice(0, 80);
    return `**${title}** · ${count} ${kind}${exclusive}\n${link}`;
  });
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('Reaction roles')
    .setDescription(lines.join('\n').slice(0, 4096));
  await interaction.reply({ embeds: [embed], flags: ephemeral().flags });
}

async function handleButton(interaction) {
  const optionId = Number(interaction.customId.split(':')[1]);
  const option = db.getPanelOption(optionId);
  const panel = option && db.getPanel(option.panel_id);
  if (!option || !panel || panel.guild_id !== interaction.guildId) {
    await interaction.reply(ephemeral('That role button is no longer active.'));
    return;
  }

  const role = interaction.guild.roles.cache.get(option.role_id);
  if (!role) {
    await interaction.reply(ephemeral('That role was deleted. A moderator can take it off the panel.'));
    return;
  }
  const hierarchy = roleAssignmentError(interaction.guild, role);
  if (hierarchy) {
    await interaction.reply(ephemeral(hierarchy));
    return;
  }

  await interaction.deferReply({ flags: ephemeral().flags });
  try {
    const member = interaction.member;
    const has = member.roles.cache.has(role.id);
    if (panel.exclusive && !has) {
      for (const other of db.panelOptions(panel.id)) {
        if (other.role_id !== role.id && member.roles.cache.has(other.role_id)) {
          await member.roles.remove(other.role_id);
        }
      }
    }
    if (has) {
      await member.roles.remove(role);
      await interaction.editReply(`Removed **${role.name}**.`);
    } else {
      await member.roles.add(role);
      await interaction.editReply(`You have **${role.name}**.`);
    }
  } catch (error) {
    console.error(error);
    const { humanize } = require('../lib/discord');
    const missing = error?.code === 50013;
    await interaction.editReply(missing
      ? 'I could not change that role. Move my role above it, and make sure I have Manage Roles.'
      : (humanize(error) || 'I could not update that role.'));
  }
}

async function handleReaction(reaction, user, added) {
  try {
    if (user.partial) user = await user.fetch();
    if (user.bot) return;
    if (reaction.partial) reaction = await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const panel = db.getPanelByMessage(reaction.message.id);
    if (!panel || panel.mode !== 'reaction') return;

    const options = db.panelOptions(panel.id);
    const option = options.find((entry) => sameEmoji(entry.emoji, reaction.emoji));
    if (!option) return;

    const guild = reaction.message.guild;
    if (!guild) return;
    const role = guild.roles.cache.get(option.role_id) || await guild.roles.fetch(option.role_id).catch(() => null);
    if (!role) return;
    const blocked = roleAssignmentError(guild, role);
    if (blocked) {
      console.error(`Cannot assign ${role.name} from panel ${panel.id}. ${blocked}`);
      if (added) await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    if (!added) {
      if (member.roles.cache.has(role.id)) await member.roles.remove(role);
      return;
    }

    if (panel.exclusive) {
      for (const other of options) {
        if (other.id === option.id || !member.roles.cache.has(other.role_id)) continue;
        await member.roles.remove(other.role_id);
        const otherReaction = reaction.message.reactions.cache.find((entry) => sameEmoji(other.emoji, entry.emoji));
        if (otherReaction) await otherReaction.users.remove(user.id).catch(() => {});
      }
    }

    if (!member.roles.cache.has(role.id)) await member.roles.add(role);
  } catch (error) {
    console.error('Reaction role failed', error);
  }
}

module.exports = {
  createPanel,
  addOption,
  removeOption,
  deletePanel,
  listPanels,
  postPreset,
  handleButton,
  handleReaction,
  renderPanel,
};
