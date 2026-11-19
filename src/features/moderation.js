'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../store');
const { getSettings } = require('../db');
const { UserError } = require('../lib/errors');
const { parseTimeout } = require('../lib/parse');
const { ephemeral, isStaff } = require('../lib/discord');
const { sendLog } = require('./logger');

function staff(interaction) {
  if (isStaff(interaction.member, getSettings(interaction.guildId))) return;
  throw new UserError('You need the staff role, Moderate Members, or Manage Server.');
}

function hierarchy(actor, target) {
  if (!target) return 'I cannot find that member.';
  if (target.id === actor.id) return 'You cannot use that on yourself.';
  if (target.id === target.guild.members.me?.id) return 'I cannot do that to myself.';
  const me = target.guild.members.me;
  if (me && target.roles.highest.position >= me.roles.highest.position) return 'That member is above my role.';
  if (actor.id !== target.guild.ownerId && target.roles.highest.position >= actor.roles.highest.position) {
    return 'That member is above your role.';
  }
  return null;
}

async function record(interaction, action, targetId, reason) {
  const entry = store.nextCase(interaction.guildId, action, targetId, interaction.user.id, reason);
  const embed = new EmbedBuilder()
    .setColor(action === 'ban' || action === 'kick' ? 0xff3b30 : 0xff9f0a)
    .setTitle(`Case ${entry.number} · ${action}`)
    .addFields(
      { name: 'Member', value: `<@${targetId}>`, inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: reason || 'No reason given.' },
    )
    .setTimestamp();
  await sendLog(interaction.guild, embed).catch((error) => console.error(error));
  return entry;
}

async function warn(interaction) {
  staff(interaction);
  const member = interaction.options.getMember('user');
  const user = interaction.options.getUser('user', true);
  if (member) {
    const problem = hierarchy(interaction.member, member);
    if (problem) throw new UserError(problem);
  }
  const reason = interaction.options.getString('reason', true).trim();
  const entry = await record(interaction, 'warn', user.id, reason);
  const delivered = await user.send({
    content: `A moderator in **${interaction.guild.name}** warned you.\n${reason}`,
  }).then(() => true).catch(() => false);
  await interaction.reply(ephemeral(
    `Case ${entry.number} recorded.${delivered ? '' : ' I could not deliver a DM.'}`,
  ));
}

async function timeout(interaction) {
  staff(interaction);
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    throw new UserError('You need the Moderate Members permission to time someone out.');
  }
  const member = interaction.options.getMember('user');
  if (!member) throw new UserError('That person is not in the server.');
  const problem = hierarchy(interaction.member, member);
  if (problem) throw new UserError(problem);
  const length = parseTimeout(interaction.options.getString('length', true));
  if (typeof length === 'object') throw new UserError(length.error);
  const reason = interaction.options.getString('reason', true).trim();
  await member.timeout(length, reason.slice(0, 512));
  const entry = await record(interaction, 'timeout', member.id, reason);
  await interaction.reply(ephemeral(`Case ${entry.number}: timed out ${member.user.username}.`));
}

async function kick(interaction) {
  staff(interaction);
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers)) {
    throw new UserError('You need the Kick Members permission.');
  }
  const member = interaction.options.getMember('user');
  if (!member) throw new UserError('That person is not in the server.');
  const problem = hierarchy(interaction.member, member);
  if (problem) throw new UserError(problem);
  const reason = interaction.options.getString('reason', true).trim();
  await member.kick(reason.slice(0, 512));
  const entry = await record(interaction, 'kick', member.id, reason);
  await interaction.reply(ephemeral(`Case ${entry.number}: kicked ${member.user.username}.`));
}

async function ban(interaction) {
  staff(interaction);
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
    throw new UserError('You need the Ban Members permission.');
  }
  const user = interaction.options.getUser('user', true);
  const member = interaction.options.getMember('user');
  if (member) {
    const problem = hierarchy(interaction.member, member);
    if (problem) throw new UserError(problem);
  }
  const reason = interaction.options.getString('reason', true).trim();
  const days = interaction.options.getInteger('delete_days') ?? 0;
  await interaction.guild.members.ban(user, { deleteMessageSeconds: days * 86_400, reason: reason.slice(0, 512) });
  const entry = await record(interaction, 'ban', user.id, reason);
  await interaction.reply(ephemeral(`Case ${entry.number}: banned ${user.username}.`));
}

async function unban(interaction) {
  staff(interaction);
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
    throw new UserError('You need the Ban Members permission.');
  }
  const id = interaction.options.getString('user', true).trim();
  if (!/^\d{17,20}$/.test(id)) throw new UserError('Paste the user ID. A mention will not work after a ban.');
  const reason = interaction.options.getString('reason')?.trim() || 'Ban removed.';
  await interaction.guild.members.unban(id, reason.slice(0, 512));
  const entry = await record(interaction, 'unban', id, reason);
  await interaction.reply(ephemeral(`Case ${entry.number}: unbanned <@${id}>.`));
}

async function history(interaction) {
  staff(interaction);
  const user = interaction.options.getUser('user', true);
  const rows = store.casesFor(interaction.guildId, user.id);
  if (!rows.length) {
    await interaction.reply(ephemeral(`${user.username} has no cases.`));
    return;
  }
  const lines = rows.map((row) => `**${row.number}.** ${row.action} — ${row.reason || 'No reason'}`);
  const embed = new EmbedBuilder()
    .setColor(0xff9f0a)
    .setTitle(`Cases for ${user.username}`)
    .setDescription(lines.join('\n').slice(0, 4096));
  await interaction.reply({ embeds: [embed], flags: ephemeral().flags });
}

module.exports = { warn, timeout, kick, ban, unban, history };
