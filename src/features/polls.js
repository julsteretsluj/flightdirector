'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');
const { UserError } = require('../lib/errors');
const { ACCENT, QUIET, parseDuration, splitPollOptions, bar, chunk } = require('../lib/parse');
const { ephemeral, sendableError, resolveMessage } = require('../lib/discord');

function renderPoll(poll) {
  const rows = db.pollTally(poll.id);
  const total = rows.reduce((sum, row) => sum + row.votes, 0);
  const description = rows.map((row) => {
    const pct = total === 0 ? 0 : Math.round((row.votes / total) * 100);
    return `**${row.label}**\n${bar(row.votes, total)}  ${row.votes} · ${pct}%`;
  }).join('\n\n');

  const notes = [
    poll.multi ? 'Choose any' : 'Choose one',
    poll.anonymous ? 'names stay hidden' : 'Voters lists names',
  ];
  if (poll.closed) notes.push('closed');
  else if (poll.ends_at) notes.push(`closes <t:${Math.floor(poll.ends_at / 1000)}:R>`);

  const embed = new EmbedBuilder()
    .setColor(poll.closed ? QUIET : ACCENT)
    .setTitle(poll.question)
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: notes.join(' · ').slice(0, 2048) });

  const choiceButtons = rows.map((row) => new ButtonBuilder()
    .setCustomId(`poll:cast:${poll.id}:${row.id}`)
    .setLabel(row.label.slice(0, 80))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(Boolean(poll.closed)));

  const components = chunk(choiceButtons, 5).map((group) => new ActionRowBuilder().addComponents(group));
  if (!poll.anonymous) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`poll:voters:${poll.id}`)
        .setLabel('Voters')
        .setStyle(ButtonStyle.Primary),
    ));
  }

  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

async function publishPoll(interaction) {
  const question = interaction.options.getString('question', true).replace(/\s+/g, ' ').trim();
  if (!question || question.length > 256) throw new UserError('The question needs to be 256 characters or fewer.');

  const labels = splitPollOptions(interaction.options.getString('options', true));
  if (labels.error) throw new UserError(labels.error);

  const duration = parseDuration(interaction.options.getString('duration'));
  if (duration && typeof duration === 'object') throw new UserError(duration.error);

  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const problem = sendableError(channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);

  const poll = db.createPoll({
    guildId: interaction.guildId,
    channelId: channel.id,
    question,
    multi: Boolean(interaction.options.getBoolean('multi')),
    anonymous: Boolean(interaction.options.getBoolean('anonymous')),
    endsAt: duration ? Date.now() + duration : null,
    createdBy: interaction.user.id,
    labels,
  });

  const view = renderPoll(poll);
  let message;
  try {
    if (channel.id === interaction.channelId) {
      const response = await interaction.reply({ ...view, withResponse: true });
      message = response.resource?.message || await interaction.fetchReply();
    } else {
      message = await channel.send(view);
      await interaction.reply(ephemeral(`Poll posted in ${channel}.`));
    }
  } catch (error) {
    db.deletePoll(poll.id);
    throw error;
  }
  db.setPollMessage(poll.id, message.id);
}

async function closePoll(client, poll) {
  if (!poll || poll.closed) return;
  const closed = { ...poll, closed: 1 };
  try {
    if (poll.message_id) {
      const channel = await client.channels.fetch(poll.channel_id);
      const message = await channel.messages.fetch(poll.message_id);
      await message.edit(renderPoll(closed));
    }
  } catch (error) {
    const gone = [10003, 10008, 50001, 50005, 50013].includes(error?.code);
    if (!gone) throw error;
  }
  db.closePollRecord(poll.id);
}

async function endPoll(interaction) {
  const message = await resolveMessage(
    interaction.client,
    interaction.guildId,
    interaction.options.getString('message', true),
    interaction.channel,
  );
  const poll = db.getPollByMessage(message.id);
  if (!poll || poll.guild_id !== interaction.guildId) throw new UserError('That message is not one of my polls.');
  const moderator = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
  if (poll.created_by !== interaction.user.id && !moderator) {
    throw new UserError('Only the person who opened the poll, or a moderator, can close it.');
  }
  if (poll.closed) throw new UserError('That poll is already closed.');
  await closePoll(interaction.client, poll);
  await interaction.reply(ephemeral('Poll closed.'));
}

async function showVoters(interaction, poll) {
  if (poll.anonymous) {
    await interaction.reply(ephemeral('This poll keeps votes anonymous.'));
    return;
  }
  const lines = db.pollTally(poll.id).map((row) => {
    const names = db.pollVoters(row.id);
    const who = names.length ? names.map((id) => `<@${id}>`).join(', ') : 'No one yet';
    return `**${row.label}** — ${row.votes}\n${who}`;
  });
  let text = lines.join('\n\n');
  if (text.length > 1900) text = `${text.slice(0, 1890)}…`;
  await interaction.reply(ephemeral(text || 'No votes yet.'));
}

async function handleButton(interaction) {
  const [, action, pollIdRaw, optionIdRaw] = interaction.customId.split(':');
  const poll = db.getPoll(Number(pollIdRaw));
  if (!poll || poll.guild_id !== interaction.guildId) {
    await interaction.reply(ephemeral('That poll is no longer active.'));
    return;
  }
  if (action === 'voters') {
    await showVoters(interaction, poll);
    return;
  }
  if (poll.closed) {
    await interaction.reply(ephemeral('This poll is closed.'));
    return;
  }

  const optionId = Number(optionIdRaw);
  const option = db.pollTally(poll.id).find((row) => row.id === optionId);
  if (!option) {
    await interaction.reply(ephemeral('That choice is no longer on the poll.'));
    return;
  }

  const result = db.castVote(poll, optionId, interaction.user.id);
  const fresh = db.getPoll(poll.id);
  await interaction.update(renderPoll(fresh));
  const text = result === 'added'
    ? `Voted for **${option.label}**.`
    : `Removed your vote for **${option.label}**.`;
  await interaction.followUp(ephemeral(text));
}

async function sweepPolls(client) {
  for (const poll of db.duePolls(Date.now())) {
    try {
      await closePoll(client, poll);
    } catch (error) {
      console.error(`Could not close poll ${poll.id}`, error);
    }
  }
}

module.exports = { publishPoll, endPoll, handleButton, sweepPolls, renderPoll };
