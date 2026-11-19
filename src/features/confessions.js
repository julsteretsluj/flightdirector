'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../db');
const { UserError } = require('../lib/errors');
const { QUIET, neutralizePings } = require('../lib/parse');
const { ephemeral, sendableError } = require('../lib/discord');

const PENDING = 0xff9f0a;
const APPROVED = 0x34c759;
const REJECTED = 0xff3b30;

function composerModal() {
  return new ModalBuilder()
    .setCustomId('confess:compose')
    .setTitle('Confession')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('What do you want to say?')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(1)
        .setMaxLength(1500)
        .setRequired(true)
        .setPlaceholder('Posted without your name.'),
    ));
}

function replyModal(confessionId) {
  return new ModalBuilder()
    .setCustomId(`confess:rmodal:${confessionId}`)
    .setTitle('Anonymous reply')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('Your reply')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(1)
        .setMaxLength(1000)
        .setRequired(true)
        .setPlaceholder('This reply is posted without your name.'),
    ));
}

function publicEmbed(confession) {
  return new EmbedBuilder()
    .setColor(QUIET)
    .setTitle(`Confession #${confession.number}`)
    .setDescription(confession.content)
    .setFooter({ text: 'Anonymous' })
    .setTimestamp(confession.created_at);
}

function publicComponents(confession) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confess:reply:${confession.id}`)
      .setLabel('Reply anonymously')
      .setStyle(ButtonStyle.Secondary),
  )];
}

function logEmbed(confession, { status, actorId } = {}) {
  const embed = new EmbedBuilder()
    .setColor(status === 'rejected' ? REJECTED : status === 'posted' ? APPROVED : PENDING)
    .setTitle(`Confession #${confession.number}`)
    .setDescription(confession.content)
    .addFields({ name: 'From', value: `<@${confession.author_id}>`, inline: true })
    .setTimestamp(confession.created_at);
  if (status === 'posted' && actorId) embed.setFooter({ text: `Approved by ${actorId}` });
  if (status === 'posted' && !actorId) embed.setFooter({ text: 'Posted' });
  if (status === 'rejected' && actorId) embed.setFooter({ text: `Rejected by ${actorId}` });
  if (!status || status === 'pending') embed.setFooter({ text: 'Waiting for review' });
  return embed;
}

function reviewComponents(confession) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confess:approve:${confession.id}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`confess:reject:${confession.id}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
  )];
}

async function configure(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new UserError('You need the Manage Server permission to set up confessions.');
  }

  const current = db.getSettings(interaction.guildId);
  const channel = interaction.options.getChannel('channel');
  const log = interaction.options.getChannel('log');
  const review = interaction.options.getBoolean('review');
  const clearLog = interaction.options.getBoolean('clear-log');
  const provided = [channel, log, review, clearLog].some((value) => value != null);
  if (!provided) {
    const embed = new EmbedBuilder()
      .setColor(QUIET)
      .setTitle('Confessions')
      .setDescription([
        `Channel: ${current.confession_channel_id ? `<#${current.confession_channel_id}>` : 'not set'}`,
        `Log: ${current.confession_log_channel_id ? `<#${current.confession_log_channel_id}>` : 'not set'}`,
        `Review: ${current.confession_review ? 'on' : 'off'}`,
        `Posted so far: ${current.confession_count || 0}`,
      ].join('\n'));
    await interaction.reply({ embeds: [embed], flags: ephemeral().flags });
    return;
  }

  if (log && clearLog) throw new UserError('Choose a log channel or clear it, not both.');
  const me = interaction.guild.members.me;
  if (channel) {
    const problem = sendableError(channel, me);
    if (problem) throw new UserError(problem);
  }
  if (log) {
    const problem = sendableError(log, me);
    if (problem) throw new UserError(problem);
  }

  const patch = {};
  if (channel) patch.confession_channel_id = channel.id;
  if (log) patch.confession_log_channel_id = log.id;
  if (clearLog) patch.confession_log_channel_id = null;
  if (review != null) patch.confession_review = review;

  const next = { ...current, ...patch };
  if (next.confession_review && !next.confession_log_channel_id) {
    throw new UserError('Set a private log channel before turning review on. Author names are posted there.');
  }
  if ((next.confession_review || patch.confession_log_channel_id) && !next.confession_channel_id && !channel) {
    throw new UserError('Set the public confession channel first.');
  }
  if (!next.confession_channel_id) throw new UserError('Set the public confession channel first.');

  db.saveSettings(interaction.guildId, patch);
  const lines = [`Public channel: <#${next.confession_channel_id}>.`];
  if (next.confession_log_channel_id) {
    lines.push(`Log: <#${next.confession_log_channel_id}>. Keep that channel moderator-only. Names are written there.`);
  } else {
    lines.push('No log channel. Approved posts will not record who sent them.');
  }
  lines.push(next.confession_review ? 'New confessions wait for approval.' : 'New confessions post immediately.');
  await interaction.reply(ephemeral(lines.join('\n')));
}

async function openComposer(interaction) {
  const settings = db.getSettings(interaction.guildId);
  if (!settings.confession_channel_id) {
    throw new UserError('Confessions are not set up yet. A moderator can run `/confess setup`.');
  }
  await interaction.showModal(composerModal());
}

async function postPublic(client, confession) {
  const settings = db.getSettings(confession.guild_id);
  const channel = await client.channels.fetch(settings.confession_channel_id).catch(() => null);
  if (!channel?.isTextBased?.()) throw new UserError('The confession channel is missing. Run `/confess setup` again.');
  const message = await channel.send({
    embeds: [publicEmbed(confession)],
    components: publicComponents(confession),
    allowedMentions: { parse: [] },
  });
  return db.markConfession(confession.id, {
    status: 'posted',
    channel_id: channel.id,
    message_id: message.id,
    thread_id: confession.thread_id,
  });
}

async function writeLog(client, confession, extras) {
  const settings = db.getSettings(confession.guild_id);
  if (!settings.confession_log_channel_id) return null;
  const channel = await client.channels.fetch(settings.confession_log_channel_id).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  const pending = confession.status !== 'posted' && confession.status !== 'rejected';
  return channel.send({
    embeds: [logEmbed(confession, extras)],
    components: pending && settings.confession_review ? reviewComponents(confession) : [],
    allowedMentions: { parse: [] },
  });
}

function unmention(text) {
  return neutralizePings(text).replace(/<(@[!&]?|#)/g, '<\u200b$1');
}

async function handleModal(interaction) {
  const content = unmention(interaction.fields.getTextInputValue('content')).trim();
  if (!content) throw new UserError('Write something first.');
  await interaction.deferReply({ flags: ephemeral().flags });

  if (interaction.customId.startsWith('confess:rmodal:')) {
    await sendReply(interaction, content);
    return;
  }

  const settings = db.getSettings(interaction.guildId);
  if (!settings.confession_channel_id) throw new UserError('Confessions are not set up yet.');

  const confession = db.allocateConfession(interaction.guildId, interaction.user.id, content);
  if (settings.confession_review) {
    const logged = await writeLog(
      interaction.client,
      { ...confession, status: 'pending' },
      { status: 'pending' },
    ).catch((error) => {
      console.error(error);
      return null;
    });
    if (!logged) {
      await interaction.editReply(
        `I saved confession #${confession.number}, but I could not reach the review channel. A moderator should check \`/confess setup\`.`,
      );
      return;
    }
    await interaction.editReply(
      `Confession #${confession.number} is waiting for a moderator. Your name stays off the public post.`,
    );
    return;
  }

  let posted;
  try {
    posted = await postPublic(interaction.client, confession);
  } catch (error) {
    db.markConfession(confession.id, {
      status: 'rejected',
      channel_id: null,
      message_id: null,
      thread_id: null,
    });
    throw error;
  }
  await writeLog(interaction.client, posted, { status: 'posted' }).catch((error) => console.error(error));
  await interaction.editReply(`Posted as confession #${posted.number}.`);
}

function canReview(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

async function handleButton(interaction) {
  const [, action, idRaw] = interaction.customId.split(':');
  const confession = db.getConfession(Number(idRaw));
  if (!confession || confession.guild_id !== interaction.guildId) {
    await interaction.reply(ephemeral('That confession is no longer available.'));
    return;
  }

  if (action === 'reply') {
    if (confession.status !== 'posted') {
      await interaction.reply(ephemeral('This confession is not public yet.'));
      return;
    }
    await interaction.showModal(replyModal(confession.id));
    return;
  }

  if (!canReview(interaction)) {
    await interaction.reply(ephemeral('Only moderators can review confessions.'));
    return;
  }

  const claimed = db.claimPendingConfession(confession.id);
  if (!claimed) {
    await interaction.reply(ephemeral('That confession was already reviewed.'));
    return;
  }

  const actor = `@${interaction.user.username}`;
  if (action === 'approve') {
    try {
      const posted = await postPublic(interaction.client, claimed);
      await interaction.update({
        embeds: [logEmbed(posted, { status: 'posted', actorId: actor })],
        components: [],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      db.markConfession(confession.id, {
        status: 'pending',
        channel_id: null,
        message_id: null,
        thread_id: null,
      });
      throw error;
    }
    return;
  }

  if (action === 'reject') {
    const rejected = db.markConfession(confession.id, {
      status: 'rejected',
      channel_id: confession.channel_id,
      message_id: confession.message_id,
      thread_id: confession.thread_id,
    });
    await interaction.update({
      embeds: [logEmbed(rejected, { status: 'rejected', actorId: actor })],
      components: [],
      allowedMentions: { parse: [] },
    });
  }
}

async function sendReply(interaction, content) {
  const confessionId = Number(interaction.customId.split(':')[2]);
  const confession = db.getConfession(confessionId);
  if (!confession || confession.status !== 'posted' || !confession.channel_id || !confession.message_id) {
    throw new UserError('That confession is not open for replies.');
  }

  const channel = await interaction.client.channels.fetch(confession.channel_id).catch(() => null);
  if (!channel?.isTextBased?.()) throw new UserError('I cannot find the confession anymore.');
  const source = await channel.messages.fetch(confession.message_id).catch(() => null);
  if (!source) throw new UserError('The original confession was deleted.');

  const embed = new EmbedBuilder()
    .setColor(QUIET)
    .setDescription(content)
    .setFooter({ text: `Anonymous reply · #${confession.number}` })
    .setTimestamp();

  let thread = null;
  if (confession.thread_id) thread = await interaction.client.channels.fetch(confession.thread_id).catch(() => null);
  if (!thread) {
    try {
      thread = await source.startThread({
        name: `Confession #${confession.number}`.slice(0, 100),
        autoArchiveDuration: 1440,
      });
      db.markConfession(confession.id, {
        status: confession.status,
        channel_id: confession.channel_id,
        message_id: confession.message_id,
        thread_id: thread.id,
      });
    } catch {
      thread = null;
    }
  }

  if (thread) {
    await thread.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } else {
    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [], repliedUser: false },
      reply: { messageReference: source.id, failIfNotExists: false },
    });
  }

  db.addConfessionReply(confession.id, interaction.user.id, content);
  await interaction.editReply('Reply posted without your name.');
}

module.exports = { configure, openComposer, handleModal, handleButton };
