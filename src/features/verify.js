'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { getSettings, saveSettings } = require('../db');
const { UserError } = require('../lib/errors');
const { ACCENT, clearedText, neutralizePings } = require('../lib/parse');
const { ephemeral, isStaff, requireManager, roleAssignmentError, sendableError } = require('../lib/discord');
const { accountTooNew, phraseMatches } = require('../lib/verify');
const { sendLog } = require('./logger');

function describe(settings) {
  const role = settings.verify_role_id ? `<@&${settings.verify_role_id}>` : 'not set';
  const hold = settings.verify_hold_role_id ? `<@&${settings.verify_hold_role_id}>` : 'none';
  const gate = settings.verify_phrase ? `type \`${settings.verify_phrase}\`` : 'button only';
  const age = settings.verify_min_hours ? `${settings.verify_min_hours} hours` : 'off';
  return [
    `Verified role ${role}`,
    `Hold role ${hold}`,
    `Gate ${gate}`,
    `Minimum account age ${age}`,
  ].join('\n');
}

function requireRole(guild, roleId, label) {
  const role = guild.roles.cache.get(roleId);
  if (!role) throw new UserError(`The ${label} role no longer exists. Run \`/verify setup\` again.`);
  const error = roleAssignmentError(guild, role);
  if (error) throw new UserError(error);
  return role;
}

function memberBlocked(guild, member) {
  const me = guild.members.me;
  if (!me) return 'I am still starting. Try again in a moment.';
  if (member.roles.highest.position >= me.roles.highest.position) {
    return 'Their highest role is above mine, so I cannot change their roles.';
  }
  return null;
}

async function applyVerification(member, { bypassAge = false, moderatorId = null } = {}) {
  const settings = getSettings(member.guild.id);
  if (!settings.verify_role_id) throw new UserError('Verification is not set up yet.');
  const blocked = memberBlocked(member.guild, member);
  if (blocked) throw new UserError(blocked);
  if (!bypassAge && accountTooNew(member.user.createdTimestamp, settings.verify_min_hours, Date.now())) {
    throw new UserError('This account is newer than this server allows. Ask a moderator to verify you.');
  }
  const role = requireRole(member.guild, settings.verify_role_id, 'verified');
  const hold = settings.verify_hold_role_id
    ? member.guild.roles.cache.get(settings.verify_hold_role_id)
    : null;
  if (!member.roles.cache.has(role.id)) await member.roles.add(role);
  if (hold && member.roles.cache.has(hold.id)) await member.roles.remove(hold);
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('Member verified')
    .setDescription(moderatorId
      ? `<@${moderatorId}> verified <@${member.id}>.`
      : `<@${member.id}> verified.`)
    .setTimestamp();
  await sendLog(member.guild, embed).catch((error) => console.error(error));
  return settings;
}

async function setup(interaction) {
  requireManager(interaction);
  const role = interaction.options.getRole('role', true);
  const hold = interaction.options.getRole('hold');
  const clearHold = interaction.options.getBoolean('clear-hold');
  if (hold && clearHold) throw new UserError('Choose a hold role, or clear it. Not both.');
  const roleError = roleAssignmentError(interaction.guild, role);
  if (roleError) throw new UserError(roleError);
  if (hold) {
    const holdError = roleAssignmentError(interaction.guild, hold);
    if (holdError) throw new UserError(holdError);
    if (hold.id === role.id) throw new UserError('The hold role and the verified role need to be different.');
  }
  const current = getSettings(interaction.guildId);
  const patch = { verify_role_id: role.id };
  if (hold) patch.verify_hold_role_id = hold.id;
  if (clearHold) patch.verify_hold_role_id = null;
  const phrase = interaction.options.getString('phrase');
  if (phrase != null) {
    const next = clearedText(phrase, current.verify_phrase);
    patch.verify_phrase = next ? next.slice(0, 80) : null;
  }
  const age = interaction.options.getInteger('age');
  if (age != null) patch.verify_min_hours = age;
  const message = interaction.options.getString('message');
  if (message != null) {
    const next = clearedText(message, current.verify_message);
    patch.verify_message = next ? neutralizePings(next).slice(0, 1000) : null;
  }
  const saved = saveSettings(interaction.guildId, patch);
  await interaction.reply({ content: describe(saved), flags: ephemeral().flags });
}

async function status(interaction) {
  if (!isStaff(interaction.member, getSettings(interaction.guildId))) {
    throw new UserError('Only staff can see the verification setup.');
  }
  await interaction.reply({ content: describe(getSettings(interaction.guildId)), flags: ephemeral().flags });
}

async function panel(interaction) {
  requireManager(interaction);
  const settings = getSettings(interaction.guildId);
  if (!settings.verify_role_id) throw new UserError('Run `/verify setup` with a verified role first.');
  const incoming = interaction.options.getString('message');
  let saved = settings;
  if (incoming != null) {
    const next = clearedText(incoming, settings.verify_message);
    saved = saveSettings(interaction.guildId, {
      verify_message: next ? neutralizePings(next).slice(0, 1000) : null,
    });
  }
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const problem = sendableError(channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('Verify')
    .setDescription(saved.verify_message || 'When you are ready, verify to see the rest of the server.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify:open').setLabel('Verify').setStyle(ButtonStyle.Success),
  );
  await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  await interaction.reply(ephemeral(`Verification panel posted in ${channel}.`));
}

async function grant(interaction) {
  const settings = getSettings(interaction.guildId);
  if (!isStaff(interaction.member, settings)) throw new UserError('Only staff can verify someone by hand.');
  const member = interaction.options.getMember('user');
  if (!member) throw new UserError('That person is not in the server.');
  if (member.user.bot) throw new UserError('Pick a person.');
  await applyVerification(member, { bypassAge: true, moderatorId: interaction.user.id });
  await interaction.reply({
    content: `<@${member.id}> is verified.`,
    flags: ephemeral().flags,
    allowedMentions: { parse: [] },
  });
}

async function remove(interaction) {
  const settings = getSettings(interaction.guildId);
  if (!isStaff(interaction.member, settings)) throw new UserError('Only staff can remove verification.');
  if (!settings.verify_role_id) throw new UserError('Verification is not set up yet.');
  const member = interaction.options.getMember('user');
  if (!member) throw new UserError('That person is not in the server.');
  const blocked = memberBlocked(interaction.guild, member);
  if (blocked) throw new UserError(blocked);
  const role = requireRole(interaction.guild, settings.verify_role_id, 'verified');
  const hold = settings.verify_hold_role_id
    ? requireRole(interaction.guild, settings.verify_hold_role_id, 'hold')
    : null;
  if (member.roles.cache.has(role.id)) await member.roles.remove(role);
  if (hold && !member.roles.cache.has(hold.id)) await member.roles.add(hold);
  const embed = new EmbedBuilder()
    .setColor(0xff3b30)
    .setTitle('Verification removed')
    .setDescription(`<@${interaction.user.id}> removed verification from <@${member.id}>.`)
    .setTimestamp();
  await sendLog(interaction.guild, embed).catch((error) => console.error(error));
  await interaction.reply({
    content: `<@${member.id}> is no longer verified.`,
    flags: ephemeral().flags,
    allowedMentions: { parse: [] },
  });
}

async function handleButton(interaction) {
  if (interaction.customId !== 'verify:open') return;
  const settings = getSettings(interaction.guildId);
  if (!settings.verify_role_id) throw new UserError('Verification is not set up yet.');
  if (interaction.member.roles.cache.has(settings.verify_role_id)) {
    throw new UserError('You are already verified.');
  }
  if (settings.verify_phrase) {
    const modal = new ModalBuilder()
      .setCustomId('verify:phrase')
      .setTitle('Verify')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('phrase')
          .setLabel('Type the phrase')
          .setPlaceholder(settings.verify_phrase.slice(0, 100))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80),
      ));
    await interaction.showModal(modal);
    return;
  }
  await applyVerification(interaction.member, { bypassAge: false });
  await interaction.reply(ephemeral('You are verified.'));
}

async function handleModal(interaction) {
  const settings = getSettings(interaction.guildId);
  const given = interaction.fields.getTextInputValue('phrase');
  if (!phraseMatches(settings.verify_phrase, given)) {
    throw new UserError('That phrase does not match. Use the text in the box and try again.');
  }
  await applyVerification(interaction.member, { bypassAge: false });
  await interaction.reply(ephemeral('You are verified.'));
}

async function onJoin(member) {
  if (member.user?.bot) return;
  const settings = getSettings(member.guild.id);
  if (!settings.verify_hold_role_id) return;
  if (settings.verify_role_id && member.roles.cache.has(settings.verify_role_id)) return;
  const role = member.guild.roles.cache.get(settings.verify_hold_role_id);
  if (!role || member.roles.cache.has(role.id)) return;
  if (roleAssignmentError(member.guild, role)) return;
  if (memberBlocked(member.guild, member)) return;
  await member.roles.add(role);
}

module.exports = {
  setup,
  status,
  panel,
  grant,
  remove,
  handleButton,
  handleModal,
  onJoin,
};
