'use strict';

const { EmbedBuilder } = require('discord.js');
const eco = require('../store-economy');
const { UserError } = require('../lib/errors');
const { ACCENT } = require('../lib/parse');
const { applyActivity, applyCozy, formatLife, newCompanion, petName, tickCompanion } = require('../lib/economy');

const COOLDOWN = 30 * 60 * 1000;

function currentPet(guildId, userId, now) {
  const row = eco.getCompanion(guildId, userId);
  if (!row) return null;
  const ticked = tickCompanion(row, now);
  if (ticked.lifetime_ms <= 0) {
    eco.deleteCompanion(guildId, userId);
    return { dead: true, name: row.name };
  }
  eco.saveCompanion(ticked);
  return ticked;
}

function requirePet(guildId, userId, now, label) {
  const pet = currentPet(guildId, userId, now);
  if (!pet) throw new UserError(`${label} does not have a companion here. \`/companion adopt\` starts one.`);
  if (pet.dead) throw new UserError(`**${pet.name}** ran out of time.`);
  return pet;
}

function changes(before, after) {
  const bits = [];
  if (after.happiness !== before.happiness) bits.push(`happiness ${after.happiness}`);
  if (after.lifetime_ms !== before.lifetime_ms) bits.push(`lifetime ${formatLife(after.lifetime_ms)}`);
  if (after.food !== before.food) bits.push(`food ${after.food}`);
  if (after.stars !== before.stars) bits.push(`stars ${after.stars}`);
  return bits.join(', ') || 'nothing changed';
}

function gate(guildId, userId, action, now) {
  const left = eco.cooldownLeft(guildId, userId, action, now);
  if (left) throw new UserError(`You can do that again in ${formatLife(left)}.`);
}

function card(pet) {
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(pet.name)
    .setDescription([
      `Happiness ${pet.happiness}/100`,
      `Lifetime ${formatLife(pet.lifetime_ms)}`,
      `Food ${pet.food}`,
      `Stars ${pet.stars}`,
    ].join('\n'));
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const now = Date.now();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (sub === 'adopt') {
    const existing = currentPet(guildId, userId, now);
    if (existing && !existing.dead) {
      throw new UserError(`You already have **${existing.name}**. \`/companion disown\` starts over.`);
    }
    const name = petName(interaction.options.getString('name', true));
    if (!name) throw new UserError('Use a name up to 24 characters.');
    const pet = newCompanion(guildId, userId, name, now);
    eco.saveCompanion(pet);
    await interaction.reply({ content: `**${name}** is with you. Happiness 70, a week of time, and 3 food.`, embeds: [card(pet)] });
    return;
  }

  if (sub === 'view') {
    const user = interaction.options.getUser('user') || interaction.user;
    const pet = currentPet(guildId, user.id, now);
    if (!pet) throw new UserError(user.id === userId ? 'You do not have a companion here.' : 'They do not have a companion here.');
    if (pet.dead) throw new UserError(`**${pet.name}** ran out of time.`);
    await interaction.reply({ embeds: [card(pet)] });
    return;
  }

  if (sub === 'disown') {
    const pet = eco.getCompanion(guildId, userId);
    if (!pet) throw new UserError('You do not have a companion here.');
    eco.deleteCompanion(guildId, userId);
    await interaction.reply(`You said goodbye to **${pet.name}**.`);
    return;
  }

  if (sub === 'play' || sub === 'feed') {
    gate(guildId, userId, `pet:${sub}`, now);
    const pet = requirePet(guildId, userId, now, 'You');
    const result = applyActivity(sub, pet, null);
    if (result.error) throw new UserError(result.error);
    eco.saveCompanion(result.self);
    eco.armCooldown(guildId, userId, `pet:${sub}`, now + COOLDOWN);
    await interaction.reply(`You ${sub === 'play' ? 'played with' : 'fed'} **${pet.name}**. ${changes(pet, result.self)}.`);
    return;
  }

  if (sub === 'playdate') {
    const other = interaction.options.getUser('user', true);
    if (other.id === userId) throw new UserError('Invite someone else.');
    if (other.bot) throw new UserError('Pick a person.');
    gate(guildId, userId, 'pet:playdate', now);
    const pet = requirePet(guildId, userId, now, 'You');
    const pal = requirePet(guildId, other.id, now, other.username);
    const result = applyActivity('playdate', pet, pal);
    if (result.error) throw new UserError(result.error);
    eco.saveCompanion(result.self);
    eco.saveCompanion(result.other);
    eco.armCooldown(guildId, userId, 'pet:playdate', now + COOLDOWN);
    await interaction.reply(`**${pet.name}** and **${pal.name}** had a playdate. Yours: ${changes(pet, result.self)}. Theirs: ${changes(pal, result.other)}.`);
    return;
  }

  if (sub === 'cozy') {
    const users = ['user', 'user2', 'user3', 'user4', 'user5']
      .map((option) => interaction.options.getUser(option))
      .filter(Boolean);
    const unique = [];
    for (const user of users) {
      if (user.bot || user.id === userId || unique.some((entry) => entry.id === user.id)) continue;
      unique.push(user);
    }
    if (!unique.length) throw new UserError('Invite at least one friend.');
    gate(guildId, userId, 'pet:cozy', now);
    const host = requirePet(guildId, userId, now, 'You');
    const guests = unique.map((user) => requirePet(guildId, user.id, now, user.username));
    const result = applyCozy(host, guests);
    if (result.error) throw new UserError(result.error);
    eco.saveCompanion(result.host);
    result.guests.forEach((guest) => eco.saveCompanion(guest));
    eco.armCooldown(guildId, userId, 'pet:cozy', now + COOLDOWN);
    await interaction.reply(`You got cozy. **${host.name}**: ${changes(host, result.host)}.`);
    return;
  }

  if (sub === 'activity') {
    const kind = interaction.options.getString('kind', true);
    const other = interaction.options.getUser('user');
    const needsOther = ['visit', 'heal', 'stroll', 'dream', 'manifest'].includes(kind);
    if (needsOther && !other) throw new UserError('Mention someone who has a companion.');
    if (other && (other.id === userId || other.bot)) throw new UserError('Pick someone else.');
    gate(guildId, userId, `pet:${kind}`, now);
    const pet = requirePet(guildId, userId, now, 'You');
    const pal = needsOther ? requirePet(guildId, other.id, now, other.username) : null;
    const roll = Math.floor(Math.random() * 100);
    const result = applyActivity(kind, pet, pal, roll);
    if (result.error) throw new UserError(result.error);
    eco.saveCompanion(result.self);
    if (result.other) eco.saveCompanion(result.other);
    eco.armCooldown(guildId, userId, `pet:${kind}`, now + COOLDOWN);
    const extra = result.other ? ` Theirs: ${changes(pal, result.other)}.` : '';
    await interaction.reply(`**${pet.name}** finished ${kind}. ${changes(pet, result.self)}.${extra}`);
  }
}

module.exports = { execute };
