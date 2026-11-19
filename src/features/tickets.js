'use strict';

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { getSettings, saveSettings } = require('../db');
const store = require('../store');
const { UserError } = require('../lib/errors');
const { ACCENT, neutralizePings } = require('../lib/parse');
const { ephemeral, isStaff, sendableError } = require('../lib/discord');
const { sendLog } = require('./logger');

function slug(name, userId) {
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  return `ticket-${clean || 'member'}-${userId.slice(-4)}`;
}

async function setup(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new UserError('You need Manage Server to set up tickets.');
  }
  const category = interaction.options.getChannel('category', true);
  const role = interaction.options.getRole('staff', true);
  if (category.type !== ChannelType.GuildCategory) throw new UserError('Choose a category, not a text channel.');
  saveSettings(interaction.guildId, { ticket_category_id: category.id, staff_role_id: role.id });
  await interaction.reply(ephemeral(
    `Tickets will open under ${category}, visible to ${role} and the member who asks.`,
  ));
}

async function panel(interaction) {
  const settings = getSettings(interaction.guildId);
  if (!isStaff(interaction.member, settings) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new UserError('Only staff can post the ticket panel.');
  }
  if (!settings.ticket_category_id || !settings.staff_role_id) {
    throw new UserError('Run `/ticket setup` with a category and a staff role first.');
  }
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const problem = sendableError(channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('Private note for staff')
    .setDescription('Open a ticket for a question, a report, or something you do not want in the public channel. Only you and staff can see it.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:open').setLabel('Open a ticket').setStyle(ButtonStyle.Primary),
  );
  await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  await interaction.reply(ephemeral(`Panel posted in ${channel}.`));
}

function composeModal() {
  return new ModalBuilder()
    .setCustomId('ticket:compose')
    .setTitle('Open a ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('Subject')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('details')
          .setLabel('What do you want staff to know?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
}

async function openFromModal(interaction) {
  const settings = getSettings(interaction.guildId);
  if (!settings.ticket_category_id || !settings.staff_role_id) {
    throw new UserError('Tickets are not set up yet.');
  }
  const existing = store.openTicketFor(interaction.guildId, interaction.user.id);
  if (existing) throw new UserError(`You already have an open ticket: <#${existing.channel_id}>.`);

  const subject = neutralizePings(interaction.fields.getTextInputValue('subject')).trim();
  const details = neutralizePings(interaction.fields.getTextInputValue('details')).trim();
  const me = interaction.guild.members.me;
  const channel = await interaction.guild.channels.create({
    name: slug(interaction.user.username, interaction.user.id),
    type: ChannelType.GuildText,
    parent: settings.ticket_category_id,
    topic: subject.slice(0, 1024),
    permissionOverwrites: [
      { id: interaction.guildId, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: settings.staff_role_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });
  const ticket = store.createTicket({
    guildId: interaction.guildId,
    channelId: channel.id,
    ownerId: interaction.user.id,
    subject,
  });
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(subject.slice(0, 256))
    .setDescription(details.slice(0, 4000))
    .setFooter({ text: `Ticket ${ticket.id}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setStyle(ButtonStyle.Danger),
  );
  await channel.send({
    content: `<@${interaction.user.id}> <@&${settings.staff_role_id}>`,
    embeds: [embed],
    components: [row],
    allowedMentions: { users: [interaction.user.id], roles: [settings.staff_role_id] },
  });
  await interaction.reply(ephemeral(`Ticket opened: ${channel}`));
}

function canClose(interaction, ticket) {
  if (ticket.owner_id === interaction.user.id) return true;
  const settings = getSettings(interaction.guildId);
  return isStaff(interaction.member, settings)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
}

async function close(interaction) {
  const ticket = store.getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status !== 'open' || ticket.guild_id !== interaction.guildId) {
    throw new UserError('This is not an open ticket.');
  }
  if (!canClose(interaction, ticket)) throw new UserError('Only the person who opened it, or staff, can close it.');
  await interaction.deferReply({ flags: ephemeral().flags });
  const messages = await interaction.channel.messages.fetch({ limit: 30 }).catch(() => null);
  const lines = messages
    ? [...messages.values()].reverse().map((message) => {
      const who = message.author?.username || 'unknown';
      return `${who}: ${(message.content || '').replace(/\s+/g, ' ').trim()}`;
    }).join('\n')
    : '';
  const file = new AttachmentBuilder(Buffer.from(lines || 'No messages saved.', 'utf8'), {
    name: `ticket-${ticket.id}.txt`,
  });
  const embed = new EmbedBuilder()
    .setColor(0x8e8e93)
    .setTitle(`Ticket closed · ${ticket.subject || ticket.id}`)
    .addFields(
      { name: 'Opened by', value: `<@${ticket.owner_id}>`, inline: true },
      { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setTimestamp();
  const logged = await sendLog(interaction.guild, embed).catch(() => false);
  if (logged && lines) {
    const logChannel = await interaction.guild.channels.fetch(getSettings(interaction.guildId).log_channel_id).catch(() => null);
    await logChannel?.send({ files: [file], allowedMentions: { parse: [] } }).catch(() => {});
  }
  store.closeTicket(ticket.id);
  await interaction.editReply(logged ? 'Closed. A copy is in the log channel.' : 'Closed. No log channel is set, so the transcript was not saved.');
  await interaction.channel.delete('Ticket closed').catch(() => {});
}

async function handleButton(interaction) {
  if (interaction.customId === 'ticket:open') {
    const open = store.openTicketFor(interaction.guildId, interaction.user.id);
    if (open) {
      await interaction.reply(ephemeral(`You already have an open ticket: <#${open.channel_id}>.`));
      return;
    }
    await interaction.showModal(composeModal());
    return;
  }
  if (interaction.customId === 'ticket:close') {
    await close(interaction);
  }
}

module.exports = { setup, panel, openFromModal, close, handleButton };
