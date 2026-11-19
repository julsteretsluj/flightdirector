'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const eco = require('../store-economy');
const { UserError } = require('../lib/errors');
const { ACCENT } = require('../lib/parse');
const { ephemeral, requireManager, sendableError } = require('../lib/discord');
const {
  SPAWN_MS,
  currencySymbol,
  diceOutcome,
  formatLife,
  formatMoney,
  makeCode,
  rollBetween,
  slotPayout,
  transferSplit,
  tuneRange,
} = require('../lib/economy');

const FACES = ['🍪', '🌸', '⭐', '🌙', '🍋'];

function symbolOf(guildId) {
  return eco.settings(guildId).symbol;
}

function earnError(result) {
  if (!result?.error) return result;
  if (result.error === 'cooldown') throw new UserError(`You can do that again in ${formatLife(result.left)}.`);
  throw new UserError(result.error);
}

function mention(userId) {
  return { users: [userId], parse: [] };
}

async function earn(interaction, kind) {
  const settings = eco.settings(interaction.guildId);
  const recipient = interaction.options.getUser('user') || interaction.user;
  if (recipient.bot) throw new UserError('Pick a person.');
  const min = kind === 'pet' ? settings.pet_min : settings.snuggle_min;
  const max = kind === 'pet' ? settings.pet_max : settings.snuggle_max;
  const cooldown = kind === 'pet' ? settings.pet_cooldown : settings.snuggle_cooldown;
  const amount = rollBetween(min, max);
  const result = earnError(eco.collectEarn(
    interaction.guildId,
    interaction.user.id,
    recipient.id,
    amount,
    kind,
    cooldown,
    Date.now(),
  ));
  if (interaction.options.getBoolean('remind')) {
    eco.setReminder(interaction.guildId, interaction.user.id, kind, result.readyAt);
  }
  const symbol = settings.symbol;
  const self = recipient.id === interaction.user.id;
  const verb = kind === 'pet' ? 'Pet' : 'Snuggle';
  const text = self
    ? `${verb} accepted. You received ${formatMoney(result.amount, symbol)}. You have ${formatMoney(result.balance, symbol)}.`
    : `${verb} accepted. You gave ${formatMoney(result.amount, symbol)} to <@${recipient.id}>. They have ${formatMoney(result.balance, symbol)}.`;
  await interaction.reply({ content: text, allowedMentions: self ? { parse: [] } : mention(recipient.id) });
}

async function clickcake(interaction) {
  const settings = eco.settings(interaction.guildId);
  const left = eco.cooldownLeft(interaction.guildId, interaction.user.id, 'cake', Date.now());
  if (left) throw new UserError(`You can do that again in ${formatLife(left)}.`);
  const readyAt = Date.now() + settings.cake_cooldown;
  eco.armCooldown(interaction.guildId, interaction.user.id, 'cake', readyAt);
  const expiry = Date.now() + 8000;
  const token = Math.random().toString(36).slice(2, 8);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cake:${interaction.user.id}:${expiry}:${token}`)
      .setLabel('Marshmallow')
      .setStyle(ButtonStyle.Primary),
  );
  await interaction.reply({
    content: 'A marshmallow. You have 8 seconds.',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function coinflip(interaction) {
  const bet = interaction.options.getInteger('bet');
  const guess = interaction.options.getString('guess');
  const side = Math.random() < 0.5 ? 'heads' : 'tails';
  if (bet == null) {
    await interaction.reply(`**${side[0].toUpperCase()}${side.slice(1)}**.`);
    return;
  }
  const settings = eco.settings(interaction.guildId);
  if (!settings.gambling) throw new UserError('Gambling is turned off in this server.');
  if (!guess) throw new UserError('Choose heads or tails when you bet.');
  assertBet(settings, bet);
  if (eco.balanceOf(interaction.guildId, interaction.user.id) < bet) throw new UserError('You do not have that much.');
  const won = guess === side;
  const result = earnError(eco.wager(interaction.guildId, interaction.user.id, bet, won ? 2 : 0));
  const symbol = settings.symbol;
  const text = won
    ? `**${side[0].toUpperCase()}${side.slice(1)}**. You won ${formatMoney(bet, symbol)}. You have ${formatMoney(result.balance, symbol)}.`
    : `**${side[0].toUpperCase()}${side.slice(1)}**. You lost ${formatMoney(bet, symbol)}. You have ${formatMoney(result.balance, symbol)}.`;
  await interaction.reply(text);
}

function assertBet(settings, bet) {
  if (bet < settings.bet_min || bet > settings.bet_max) {
    throw new UserError(`Bets in this server are ${formatMoney(settings.bet_min, settings.symbol)} to ${formatMoney(settings.bet_max, settings.symbol)}.`);
  }
}

async function dice(interaction) {
  const settings = eco.settings(interaction.guildId);
  if (!settings.gambling) throw new UserError('Gambling is turned off in this server.');
  const bet = interaction.options.getInteger('bet', true);
  assertBet(settings, bet);
  if (eco.balanceOf(interaction.guildId, interaction.user.id) < bet) throw new UserError('You do not have that much.');
  const roll = 1 + Math.floor(Math.random() * 100);
  const multiplier = diceOutcome(roll);
  const result = earnError(eco.wager(interaction.guildId, interaction.user.id, bet, multiplier));
  const symbol = settings.symbol;
  const profit = bet * Math.max(multiplier - 1, 0);
  const outcome = multiplier === 0
    ? `You lost ${formatMoney(bet, symbol)}.`
    : `You earned ${formatMoney(profit, symbol)}.`;
  await interaction.reply(`Rolled **${roll}**. ${outcome} You have ${formatMoney(result.balance, symbol)}.`);
}

async function slots(interaction) {
  const settings = eco.settings(interaction.guildId);
  if (!settings.gambling) throw new UserError('Gambling is turned off in this server.');
  const bet = interaction.options.getInteger('bet', true);
  assertBet(settings, bet);
  if (eco.balanceOf(interaction.guildId, interaction.user.id) < bet) throw new UserError('You do not have that much.');
  const reels = [0, 1, 2].map(() => FACES[Math.floor(Math.random() * FACES.length)]);
  const multiplier = slotPayout(reels);
  const result = earnError(eco.wager(interaction.guildId, interaction.user.id, bet, multiplier));
  const symbol = settings.symbol;
  const outcome = multiplier === 0
    ? `You lost ${formatMoney(bet, symbol)}.`
    : `You got ${multiplier}× back.`;
  await interaction.reply(`${reels.join(' ')} ${outcome} You have ${formatMoney(result.balance, symbol)}.`);
}

async function balance(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const amount = eco.balanceOf(interaction.guildId, user.id);
  const who = user.id === interaction.user.id ? 'You have' : `<@${user.id}> has`;
  await interaction.reply({
    content: `${who} ${formatMoney(amount, symbolOf(interaction.guildId))}.`,
    allowedMentions: { parse: [] },
  });
}

async function board(interaction) {
  const page = interaction.options.getInteger('page') || 1;
  const total = eco.balanceCount(interaction.guildId);
  const pages = Math.max(1, Math.ceil(total / 10));
  const current = Math.min(Math.max(page, 1), pages);
  const rows = eco.leaderboard(interaction.guildId, (current - 1) * 10, 10);
  const symbol = symbolOf(interaction.guildId);
  const embed = new EmbedBuilder().setColor(ACCENT).setTitle('Leaderboard');
  if (!rows.length) embed.setDescription('No balances yet.');
  else {
    embed
      .setDescription(rows.map((row, index) => `${(current - 1) * 10 + index + 1}. <@${row.user_id}> — ${formatMoney(row.amount, symbol)}`).join('\n'))
      .setFooter({ text: `Page ${current} of ${pages}` });
  }
  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function giveCurrency(interaction) {
  const settings = eco.settings(interaction.guildId);
  const user = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  if (user.bot) throw new UserError('Pick a person.');
  if (user.id === interaction.user.id) throw new UserError('Pick someone else.');
  if (amount < settings.transfer_min || amount > settings.transfer_max) {
    throw new UserError(`Gifts here are ${formatMoney(settings.transfer_min, settings.symbol)} to ${formatMoney(settings.transfer_max, settings.symbol)}.`);
  }
  const split = transferSplit(amount, settings.transfer_tax, eco.balanceOf(interaction.guildId, interaction.user.id));
  if (split.error) throw new UserError(split.error);
  const moved = earnError(eco.transfer(interaction.guildId, interaction.user.id, user.id, split.amount, split.received));
  const balance = moved.balance;
  const tax = split.tax ? ` Tax kept ${formatMoney(split.tax, settings.symbol)}.` : '';
  await interaction.reply({
    content: `Gave ${formatMoney(split.received, settings.symbol)} to <@${user.id}>. They have ${formatMoney(balance, settings.symbol)}.${tax}`,
    allowedMentions: mention(user.id),
  });
}

async function giveItem(interaction) {
  const user = interaction.options.getUser('user', true);
  const name = interaction.options.getString('item', true);
  const amount = interaction.options.getInteger('amount') || 1;
  if (user.bot) throw new UserError('Pick a person.');
  const result = earnError(eco.giveItems(interaction.guildId, interaction.user.id, user.id, name, amount));
  await interaction.reply({
    content: `Gave **${result.quantity} ${result.name}** to <@${user.id}>.`,
    allowedMentions: mention(user.id),
  });
}

function claimRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`drop:claim:${id}`).setLabel('Pick up').setStyle(ButtonStyle.Primary),
  );
}

async function drop(interaction) {
  const settings = eco.settings(interaction.guildId);
  const amount = interaction.options.getInteger('amount', true);
  const code = settings.pick_hard ? makeCode() : null;
  const created = earnError(eco.createDrop({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    amount,
    code,
    onceOnly: settings.pick_once,
  }));
  const codeLine = code ? ` Code \`${code}\`.` : '';
  const response = await interaction.reply({
    content: `<@${interaction.user.id}> dropped ${formatMoney(created.amount, settings.symbol)}.${codeLine}`,
    components: code ? [] : [claimRow(created.id)],
    allowedMentions: { parse: [] },
    withResponse: true,
  });
  const message = response.resource?.message || await interaction.fetchReply();
  eco.setDropMessage(created.id, message.id);
}

async function pick(interaction) {
  const dropRow = eco.latestDrop(interaction.guildId, interaction.channelId);
  if (!dropRow) throw new UserError('Nothing is waiting in this channel.');
  await payDrop(interaction, dropRow.id, interaction.options.getString('code'));
}

async function payDrop(interaction, dropId, code) {
  const settings = eco.settings(interaction.guildId);
  const result = earnError(eco.claimDrop(dropId, interaction.user.id, code, {
    min: settings.pick_min,
    max: settings.pick_max,
  }));
  const text = `You picked up ${formatMoney(result.amount, settings.symbol)}.${result.remaining > 0 ? ` ${formatMoney(result.remaining, settings.symbol)} left.` : ''}`;
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
}

async function eventStart(interaction) {
  requireManager(interaction);
  const channel = interaction.options.getChannel('channel', true);
  const channelError = sendableError(channel, interaction.guild.members.me);
  if (channelError) throw new UserError(channelError);
  const created = eco.createEvent({
    guildId: interaction.guildId,
    channelId: channel.id,
    amount: interaction.options.getInteger('amount', true),
    label: interaction.options.getString('label') || 'Claim',
    description: interaction.options.getString('description'),
  });
  if (created.error) throw new UserError(created.error);
  const settings = eco.settings(interaction.guildId);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:claim:${created.id}`)
      .setLabel((interaction.options.getString('label') || 'Claim').slice(0, 80))
      .setStyle(ButtonStyle.Success),
  );
  const description = interaction.options.getString('description');
  const content = `${description ? `${description}\n` : ''}Claim ${formatMoney(created.amount, settings.symbol)}.`;
  try {
    const message = await channel.send({
      content,
      components: [row],
      allowedMentions: { parse: [] },
    });
    eco.setEventMessage(created.id, message.id);
  } catch (error) {
    eco.endEvents(interaction.guildId, channel.id);
    throw error;
  }
  await interaction.reply({ content: `Event posted in ${channel}.`, flags: MessageFlags.Ephemeral });
}

async function eventEnd(interaction) {
  requireManager(interaction);
  const channel = interaction.options.getChannel('channel', true);
  const rows = eco.endEvents(interaction.guildId, channel.id);
  if (!rows.length) throw new UserError('That channel has no running event.');
  for (const row of rows) {
    if (!row.message_id) continue;
    const message = await channel.messages.fetch(row.message_id).catch(() => null);
    if (message) await message.edit({ components: [] }).catch(() => {});
  }
  await interaction.reply({ content: `Ended the event in ${channel}.`, flags: MessageFlags.Ephemeral });
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'balance') return balance(interaction);
  if (sub === 'pet') return earn(interaction, 'pet');
  if (sub === 'snuggle') return earn(interaction, 'snuggle');
  if (sub === 'clickcake') return clickcake(interaction);
  if (sub === 'coinflip') return coinflip(interaction);
  if (sub === 'dice') return dice(interaction);
  if (sub === 'slots') return slots(interaction);
  if (sub === 'leaderboard') return board(interaction);
  if (sub === 'give') return giveCurrency(interaction);
  if (sub === 'give-item') return giveItem(interaction);
  if (sub === 'drop') return drop(interaction);
  if (sub === 'pick') return pick(interaction);
  if (sub === 'event-start') return eventStart(interaction);
  if (sub === 'event-end') return eventEnd(interaction);
  throw new UserError('That currency action is not available.');
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const names = eco.inventoryNames(interaction.guildId, interaction.user.id);
  await interaction.respond(
    names
      .filter((name) => name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((name) => ({ name, value: name })),
  );
}

async function handleButton(interaction) {
  const [scope, action, first, second] = interaction.customId.split(':');
  if (scope === 'cake') {
    if (action !== interaction.user.id) {
      await interaction.reply(ephemeral('That marshmallow is not yours.'));
      return;
    }
    if (Date.now() > Number(first)) {
      await interaction.update({ content: 'The marshmallow melted.', components: [] });
      return;
    }
    const settings = eco.settings(interaction.guildId);
    const result = eco.claimCake(interaction.guildId, interaction.user.id, settings.cake_amount, second);
    if (result.error) {
      await interaction.update({ content: result.error, components: [] });
      return;
    }
    await interaction.update({
      content: `You got ${formatMoney(result.amount, settings.symbol)}. You have ${formatMoney(result.balance, settings.symbol)}.`,
      components: [],
    });
    return;
  }
  if (scope === 'drop' && action === 'claim') {
    const row = eco.getDrop(Number(first));
    if (row?.code) {
      await interaction.reply(ephemeral('This drop needs the code from the message. Use `/cash pick`.'));
      return;
    }
    await payDrop(interaction, Number(first), null);
    if (eco.getDrop(Number(first))?.remaining <= 0 && interaction.message?.editable) {
      await interaction.message.edit({ components: [] }).catch(() => {});
    }
    return;
  }
  if (scope === 'event' && action === 'claim') {
    const result = eco.claimEvent(Number(first), interaction.user.id);
    if (result.error) {
      await interaction.reply(ephemeral(result.error));
      return;
    }
    const symbol = symbolOf(interaction.guildId);
    await interaction.reply(ephemeral(`You received ${formatMoney(result.amount, symbol)}. You have ${formatMoney(result.balance, symbol)}.`));
  }
}

function onJoin(member) {
  if (member.user?.bot) return;
  const settings = eco.settings(member.guild.id);
  if (settings.start_amount > 0) eco.grantStart(member.guild.id, member.id, settings.start_amount);
}

function onLeave(member) {
  const settings = eco.settings(member.guild.id);
  if (settings.save_on_leave) return;
  eco.forgetMember(member.guild.id, member.id);
}

async function spawnDrop(client, settings) {
  const channels = eco.listPickChannels(settings.guild_id);
  const nextAt = Date.now() + (SPAWN_MS[settings.pick_speed] || SPAWN_MS.medium);
  eco.saveSettings(settings.guild_id, { next_spawn_at: channels.length ? nextAt : 0 });
  const guild = client.guilds.cache.get(settings.guild_id);
  if (!guild || !channels.length) return;
  const free = channels.filter((channelId) => !eco.openDrop(settings.guild_id, channelId));
  if (!free.length) return;
  const channelId = free[Math.floor(Math.random() * free.length)];
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased?.()) return;
  const amount = rollBetween(settings.pick_min, settings.pick_max);
  const code = settings.pick_hard ? makeCode() : null;
  const created = eco.createDrop({
    guildId: settings.guild_id,
    channelId,
    amount,
    code,
    onceOnly: settings.pick_once,
  });
  if (created.error) return;
  try {
    const content = code
      ? `Quick! Pick up ${formatMoney(amount, settings.symbol)} with \`/cash pick code:${code}\`.`
      : `Quick! Pick up ${formatMoney(amount, settings.symbol)}.`;
    const message = await channel.send({
      content,
      components: code ? [] : [claimRow(created.id)],
      allowedMentions: { parse: [] },
    });
    eco.setDropMessage(created.id, message.id);
  } catch (error) {
    eco.closeDrop(created.id);
    console.error(error);
  }
}

async function sweepEconomy(client) {
  const now = Date.now();
  for (const row of eco.dueReminders(now)) {
    eco.markReminder(row.guild_id, row.user_id, row.action);
    const user = await client.users.fetch(row.user_id).catch(() => null);
    if (!user) continue;
    const label = row.action === 'snuggle' ? 'snuggle' : 'pet';
    await user.send(`You can ${label} again.`).catch(() => {});
  }
  for (const row of eco.dueSpawnGuilds(now)) {
    await spawnDrop(client, row).catch((error) => console.error(error));
  }
}

function describeSettings(guildId) {
  const settings = eco.settings(guildId);
  const channels = eco.listPickChannels(guildId);
  return [
    `Symbol ${settings.symbol}`,
    `Starting balance ${settings.start_amount}`,
    `On leave ${settings.save_on_leave ? 'keep balances' : 'delete balances'}`,
    `Pet ${Math.round(settings.pet_cooldown / 60000)}m, ${settings.pet_min}–${settings.pet_max}`,
    `Snuggle ${Math.round(settings.snuggle_cooldown / 60000)}m, ${settings.snuggle_min}–${settings.snuggle_max}`,
    `Marshmallow ${Math.round(settings.cake_cooldown / 60000)}m, ${settings.cake_amount} each`,
    `Bets ${settings.bet_min}–${settings.bet_max}, gambling ${settings.gambling ? 'on' : 'off'}`,
    `Gifts ${settings.transfer_min}–${settings.transfer_max}, tax ${settings.transfer_tax}%`,
    `Drops ${settings.pick_min}–${settings.pick_max}, ${settings.pick_speed}, ${settings.pick_once ? 'first person' : 'several people'}, ${settings.pick_hard ? 'code required' : 'no code'}`,
    `Drop channels ${channels.length ? channels.map((id) => `<#${id}>`).join(', ') : 'none'}`,
    `Buy confirmation ${settings.confirm_buy ? 'on' : 'off'}`,
    `Item ids ${settings.show_ids ? 'shown' : 'hidden'}`,
  ].join('\n');
}

async function executeSettings(interaction) {
  requireManager(interaction);
  const sub = interaction.options.getSubcommand();
  const current = eco.settings(interaction.guildId);
  if (sub === 'show') {
    await interaction.reply({ content: describeSettings(interaction.guildId), flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'symbol') {
    const symbol = currencySymbol(interaction.options.getString('symbol', true));
    if (!symbol) throw new UserError('Use a symbol up to 32 characters.');
    eco.saveSettings(interaction.guildId, { symbol });
  } else if (sub === 'start') {
    eco.saveSettings(interaction.guildId, { start_amount: interaction.options.getInteger('amount', true) });
  } else if (sub === 'onleave') {
    eco.saveSettings(interaction.guildId, { save_on_leave: interaction.options.getString('mode', true) === 'save' ? 1 : 0 });
  } else if (sub === 'pet' || sub === 'snuggle') {
    const minutes = interaction.options.getInteger('cooldown');
    const min = interaction.options.getInteger('min');
    const max = interaction.options.getInteger('max');
    if (minutes == null && min == null && max == null) throw new UserError('Set a cooldown, a minimum, or a maximum.');
    const range = tuneRange(current[`${sub}_min`], current[`${sub}_max`], min, max);
    const patch = { [`${sub}_min`]: range.min, [`${sub}_max`]: range.max };
    if (minutes != null) patch[`${sub}_cooldown`] = minutes * 60 * 1000;
    eco.saveSettings(interaction.guildId, patch);
  } else if (sub === 'cake') {
    const minutes = interaction.options.getInteger('cooldown');
    const amount = interaction.options.getInteger('amount');
    if (minutes == null && amount == null) throw new UserError('Set a cooldown or an amount.');
    const patch = {};
    if (minutes != null) patch.cake_cooldown = minutes * 60 * 1000;
    if (amount != null) patch.cake_amount = amount;
    eco.saveSettings(interaction.guildId, patch);
  } else if (sub === 'bet') {
    const min = interaction.options.getInteger('min');
    const max = interaction.options.getInteger('max');
    if (min == null && max == null) throw new UserError('Set a minimum or a maximum.');
    const range = tuneRange(current.bet_min, current.bet_max, min, max);
    eco.saveSettings(interaction.guildId, { bet_min: range.min, bet_max: range.max });
  } else if (sub === 'transfer') {
    const min = interaction.options.getInteger('min');
    const max = interaction.options.getInteger('max');
    const tax = interaction.options.getInteger('tax');
    if (min == null && max == null && tax == null) throw new UserError('Set a minimum, a maximum, or a tax.');
    const range = tuneRange(current.transfer_min, current.transfer_max, min, max);
    const patch = { transfer_min: range.min, transfer_max: range.max };
    if (tax != null) patch.transfer_tax = tax;
    eco.saveSettings(interaction.guildId, patch);
  } else if (sub === 'pick') {
    const min = interaction.options.getInteger('min');
    const max = interaction.options.getInteger('max');
    const speed = interaction.options.getString('speed');
    const type = interaction.options.getString('type');
    const hard = interaction.options.getString('hard');
    if (min == null && max == null && !speed && !type && !hard) {
      throw new UserError('Change the amount, speed, who can pick, or the code.');
    }
    const range = tuneRange(current.pick_min, current.pick_max, min, max);
    const patch = { pick_min: range.min, pick_max: range.max };
    if (speed) patch.pick_speed = speed;
    if (type) patch.pick_once = type === 'first' ? 1 : 0;
    if (hard) patch.pick_hard = hard === 'code' ? 1 : 0;
    if (speed && eco.listPickChannels(interaction.guildId).length) {
      patch.next_spawn_at = Date.now() + (SPAWN_MS[speed] || SPAWN_MS.medium);
    }
    eco.saveSettings(interaction.guildId, patch);
  } else if (sub === 'pick-channel') {
    const channel = interaction.options.getChannel('channel', true);
    const channelError = sendableError(channel, interaction.guild.members.me);
    if (channelError) throw new UserError(channelError);
    const action = interaction.options.getString('action', true);
    if (action === 'add') {
      eco.addPickChannel(interaction.guildId, channel.id);
      const saved = eco.settings(interaction.guildId);
      if (!saved.next_spawn_at) {
        eco.saveSettings(interaction.guildId, {
          next_spawn_at: Date.now() + (SPAWN_MS[saved.pick_speed] || SPAWN_MS.medium),
        });
      }
    } else {
      eco.removePickChannel(interaction.guildId, channel.id);
      if (!eco.listPickChannels(interaction.guildId).length) eco.saveSettings(interaction.guildId, { next_spawn_at: 0 });
    }
  } else if (sub === 'confirm') {
    eco.saveSettings(interaction.guildId, { confirm_buy: interaction.options.getBoolean('enabled', true) ? 1 : 0 });
  } else if (sub === 'ids') {
    eco.saveSettings(interaction.guildId, { show_ids: interaction.options.getBoolean('enabled', true) ? 1 : 0 });
  } else if (sub === 'gambling') {
    eco.saveSettings(interaction.guildId, { gambling: interaction.options.getBoolean('enabled', true) ? 1 : 0 });
  } else if (sub === 'grant' || sub === 'take') {
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (sub === 'grant') eco.credit(interaction.guildId, user.id, amount);
    else if (!eco.debit(interaction.guildId, user.id, amount)) {
      throw new UserError(`They have ${formatMoney(eco.balanceOf(interaction.guildId, user.id), current.symbol)}.`);
    }
    const balance = eco.balanceOf(interaction.guildId, user.id);
    await interaction.reply({
      content: `<@${user.id}> has ${formatMoney(balance, current.symbol)}.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  } else if (sub === 'reset') {
    const target = interaction.options.getString('target', true);
    const user = interaction.options.getUser('user');
    const wide = ['balances', 'inventories', 'shop', 'events'].includes(target);
    if (wide && !interaction.options.getBoolean('confirm')) {
      throw new UserError('Set confirm to true. This clears that data for the whole server.');
    }
    if ((target === 'user-balance' || target === 'user-inventory') && !user) throw new UserError('Choose a user.');
    if (target === 'user-balance') eco.resetUserBalance(interaction.guildId, user.id);
    if (target === 'user-inventory') eco.resetUserInventory(interaction.guildId, user.id);
    if (target === 'balances') eco.resetBalances(interaction.guildId);
    if (target === 'inventories') eco.resetInventories(interaction.guildId);
    if (target === 'shop') eco.resetShop(interaction.guildId);
    if (target === 'events') {
      const rows = eco.resetEvents(interaction.guildId);
      for (const row of rows) {
        if (!row.message_id) continue;
        const channel = interaction.guild.channels.cache.get(row.channel_id);
        const message = await channel?.messages.fetch(row.message_id).catch(() => null);
        if (message) await message.edit({ components: [] }).catch(() => {});
      }
    }
  } else {
    throw new UserError('That setting is not available.');
  }
  await interaction.reply({ content: describeSettings(interaction.guildId), flags: MessageFlags.Ephemeral });
}

module.exports = {
  execute,
  executeSettings,
  autocomplete,
  handleButton,
  onJoin,
  onLeave,
  sweepEconomy,
};
