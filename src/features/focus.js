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
const store = require('../store');
const db = require('../db');
const { UserError } = require('../lib/errors');
const { ACCENT } = require('../lib/parse');
const { ephemeral, isStaff, sendableError } = require('../lib/discord');
const { advancePhase } = require('../lib/guard');

function clock(ms) {
  const left = Math.max(0, ms);
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function renderFocus(session, members) {
  const people = members.map((member) => {
    const mark = member.done ? '✓ ' : '';
    const intention = member.intention ? ` — ${member.intention}` : '';
    return `${mark}<@${member.user_id}>${intention}`;
  });
  const title = session.closed
    ? 'Session closed'
    : `${session.phase === 'work' ? 'Work' : 'Break'} · round ${session.round}`;
  const embed = new EmbedBuilder()
    .setColor(session.phase === 'break' ? 0x34c759 : ACCENT)
    .setTitle(title)
    .setDescription([
      session.closed ? 'That sprint is over.' : `${clock(session.phase_ends_at - Date.now())} left`,
      people.join('\n') || 'No one has joined yet.',
    ].join('\n\n').slice(0, 4096))
    .setFooter({ text: 'Join, name a small intention, then mark it done.' });
  if (session.closed) return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`focus:join:${session.id}`).setLabel('Join').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`focus:intent:${session.id}`).setLabel('Intention').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`focus:done:${session.id}`).setLabel('Done').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`focus:stop:${session.id}`).setLabel('Stop').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

async function refresh(client, session, { announce = false } = {}) {
  const members = store.focusMembers(session.id);
  const channel = await client.channels.fetch(session.channel_id).catch(() => null);
  if (!channel?.isTextBased?.() || !session.message_id) return;
  const message = await channel.messages.fetch(session.message_id).catch(() => null);
  if (message) await message.edit(renderFocus(session, members)).catch(() => {});
  if (announce && !session.closed) {
    const ids = members.map((member) => member.user_id);
    const label = session.phase === 'break' ? 'Break' : `Round ${session.round}`;
    await channel.send({
      content: ids.length ? `${label} started. ${ids.map((id) => `<@${id}>`).join(' ')}` : `${label} started.`,
      allowedMentions: { parse: ['users'], users: ids },
    }).catch(() => {});
  }
}

async function start(interaction) {
  if (store.openFocus(interaction.channelId)) throw new UserError('This channel already has a sprint. Join that one, or stop it first.');
  const problem = sendableError(interaction.channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);
  const work = interaction.options.getInteger('work') ?? 25;
  const rest = interaction.options.getInteger('break') ?? 5;
  const session = store.createFocus({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    hostId: interaction.user.id,
    workMs: work * 60_000,
    breakMs: rest * 60_000,
    intention: interaction.options.getString('intention'),
  });
  try {
    const message = await interaction.reply({
      ...renderFocus(session, store.focusMembers(session.id)),
      withResponse: true,
    });
    const sent = message.resource?.message || await interaction.fetchReply();
    store.setFocusMessage(session.id, sent.id);
  } catch (error) {
    store.closeFocus(session.id);
    throw error;
  }
}

async function join(interaction, sessionId) {
  const session = store.getFocus(sessionId) || store.openFocus(interaction.channelId);
  if (!session || session.closed || session.guild_id !== interaction.guildId) {
    throw new UserError('There is no open sprint here.');
  }
  store.joinFocus(session.id, interaction.user.id);
  await refresh(interaction.client, store.getFocus(session.id));
  if (interaction.deferred || interaction.replied) return;
  await interaction.reply(ephemeral('You are in this sprint.'));
}

async function leave(interaction) {
  const session = store.openFocus(interaction.channelId);
  if (!session) throw new UserError('There is no open sprint here.');
  store.leaveFocus(session.id, interaction.user.id);
  await refresh(interaction.client, session);
  await interaction.reply(ephemeral('You left the sprint. The timer keeps going for everyone else.'));
}

async function intention(interaction, sessionId, text) {
  const session = store.getFocus(sessionId) || store.openFocus(interaction.channelId);
  if (!session || session.closed) throw new UserError('There is no open sprint here.');
  const intentionText = (text || interaction.options?.getString('text') || '').trim();
  if (!intentionText) throw new UserError('Name a small task, like "draft the intro".');
  store.setIntention(session.id, interaction.user.id, intentionText.slice(0, 140));
  await refresh(interaction.client, store.getFocus(session.id));
  if (!interaction.replied && !interaction.deferred) await interaction.reply(ephemeral(`Intention set: ${intentionText.slice(0, 140)}`));
}

async function done(interaction, sessionId) {
  const session = store.getFocus(sessionId) || store.openFocus(interaction.channelId);
  if (!session || session.closed) throw new UserError('There is no open sprint here.');
  store.finishIntention(session.id, interaction.user.id);
  await refresh(interaction.client, store.getFocus(session.id));
  if (!interaction.replied && !interaction.deferred) await interaction.reply(ephemeral('Marked your intention done.'));
}

async function stop(interaction, sessionId) {
  const session = store.getFocus(sessionId) || store.openFocus(interaction.channelId);
  if (!session || session.closed || session.guild_id !== interaction.guildId) {
    throw new UserError('There is no open sprint here.');
  }
  const staff = isStaff(interaction.member, db.getSettings(interaction.guildId))
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
  if (session.host_id !== interaction.user.id && !staff) {
    throw new UserError('Only the host, or a moderator, can stop this sprint.');
  }
  store.closeFocus(session.id);
  await refresh(interaction.client, { ...session, closed: 1 });
  if (!interaction.replied && !interaction.deferred) await interaction.reply(ephemeral('Sprint stopped.'));
}

async function status(interaction) {
  const session = store.openFocus(interaction.channelId);
  if (!session) throw new UserError('There is no open sprint in this channel.');
  await interaction.reply({
    ...renderFocus(session, store.focusMembers(session.id)),
    flags: ephemeral().flags,
  });
}

async function checkin(interaction) {
  const text = interaction.options.getString('text', true).trim();
  if (!text) throw new UserError('Say what you are about to do.');
  const problem = sendableError(interaction.channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);
  const row = store.createCheckin({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    intention: text.slice(0, 200),
  });
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: interaction.member?.displayName || interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setDescription(text.slice(0, 200))
    .setFooter({ text: 'Check-in' });
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`checkin:done:${row.id}`).setLabel('Done').setStyle(ButtonStyle.Success),
  );
  const message = await interaction.reply({
    embeds: [embed],
    components: [rowButtons],
    allowedMentions: { parse: [] },
    withResponse: true,
  });
  const sent = message.resource?.message || await interaction.fetchReply();
  store.setCheckinMessage(row.id, sent.id);
}

async function tasks(interaction) {
  const rows = store.openCheckins(interaction.guildId, interaction.user.id);
  if (!rows.length) {
    await interaction.reply(ephemeral('You have no open check-ins.'));
    return;
  }
  const lines = rows.map((row) => `**#${row.id}** ${row.intention}`);
  await interaction.reply(ephemeral(lines.join('\n').slice(0, 1900)));
}

async function handleButton(interaction) {
  const [, action, idRaw] = interaction.customId.split(':');
  const id = Number(idRaw);
  if (interaction.customId.startsWith('checkin:')) {
    const row = store.getCheckin(id);
    if (!row || row.guild_id !== interaction.guildId) {
      await interaction.reply(ephemeral('That check-in is gone.'));
      return;
    }
    if (row.user_id !== interaction.user.id) {
      await interaction.reply(ephemeral('Only the person who posted this check-in can mark it done.'));
      return;
    }
    const doneRow = store.completeCheckin(id);
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8e8e93)
          .setAuthor({ name: interaction.member?.displayName || interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
          .setDescription(`~~${doneRow.intention}~~`)
          .setFooter({ text: 'Done' }),
      ],
      components: [],
    });
    return;
  }

  if (action === 'intent') {
    const modal = new ModalBuilder()
      .setCustomId(`focus:intent-modal:${id}`)
      .setTitle('Intention')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel('What are you sitting down to do?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(140),
      ));
    await interaction.showModal(modal);
    return;
  }
  if (action === 'join') {
    await join(interaction, id);
    return;
  }
  if (action === 'done') {
    await done(interaction, id);
    if (!interaction.replied && !interaction.deferred) await interaction.reply(ephemeral('Marked your intention done.'));
    return;
  }
  if (action === 'stop') {
    await stop(interaction, id);
    if (!interaction.replied && !interaction.deferred) await interaction.reply(ephemeral('Sprint stopped.'));
  }
}

async function handleModal(interaction) {
  const id = Number(interaction.customId.split(':')[2]);
  const text = interaction.fields.getTextInputValue('text');
  await intention(interaction, id, text);
  if (!interaction.replied && !interaction.deferred) await interaction.reply(ephemeral('Intention saved.'));
}

async function sweepFocus(client) {
  const open = store.listOpenFocus();
  for (const session of open) {
    try {
      const next = advancePhase(session, Date.now());
      if (next.changed) {
        store.saveFocusPhase(session.id, next.phase, next.phase_ends_at, next.round);
        await refresh(client, { ...session, ...next, closed: 0 }, { announce: true });
      } else {
        await refresh(client, session);
      }
    } catch (error) {
      console.error(`Could not refresh sprint ${session.id}`, error);
    }
  }
}

module.exports = {
  start,
  join,
  leave,
  intention,
  done,
  stop,
  status,
  checkin,
  tasks,
  handleButton,
  handleModal,
  sweepFocus,
  advancePhase,
};
