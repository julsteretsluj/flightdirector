'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const eco = require('../store-economy');
const { UserError } = require('../lib/errors');
const { ACCENT } = require('../lib/parse');
const { formatMoney, itemName, pageOf } = require('../lib/economy');
const { requireManager, roleAssignmentError } = require('../lib/discord');

function itemLine(item, symbol, showId) {
  const stock = item.stock == null ? 'unlimited' : `${item.stock} left`;
  const bits = [`**${item.name}** — ${formatMoney(item.price, symbol)}`, stock];
  if (item.role_id) bits.push(`gives <@&${item.role_id}> on use`);
  if (item.require_role_id) bits.push(`needs <@&${item.require_role_id}>`);
  if (item.remove_role_id) bits.push(`removes <@&${item.remove_role_id}> on use`);
  if (!item.giftable) bits.push('not giftable');
  const body = item.description ? `\n${item.description}` : '';
  const id = showId ? `\n\`id ${item.id}\`` : '';
  return `${bits.join(' · ')}${body}${id}`;
}

function pageRow(current, pages) {
  if (pages < 2) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop:page:${current - 1}`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current <= 1),
    new ButtonBuilder()
      .setCustomId(`shop:page:${current + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages),
  )];
}

function renderShop(guildId, page) {
  const settings = eco.settings(guildId);
  const items = eco.listShop(guildId);
  const view = pageOf(items, page, 5);
  const embed = new EmbedBuilder().setColor(ACCENT).setTitle('Shop');
  if (!items.length) {
    embed.setDescription('The shop is empty. Someone with Manage Server can add an item with `/shop add`. Stock `0` means unlimited.');
    return { embeds: [embed], components: [] };
  }
  embed
    .setDescription(view.slice.map((item) => itemLine(item, settings.symbol, settings.show_ids)).join('\n\n'))
    .setFooter({ text: `Page ${view.current} of ${view.pages} · /shop buy` });
  return { embeds: [embed], components: pageRow(view.current, view.pages) };
}

function assertAssignable(guild, role) {
  if (!role) return null;
  const error = roleAssignmentError(guild, role);
  if (error) throw new UserError(error);
  return role.id;
}

function finish(result) {
  if (result?.error) throw new UserError(result.error);
  return result;
}

async function view(interaction) {
  const page = interaction.options.getInteger('page') || 1;
  await interaction.reply(renderShop(interaction.guildId, page));
}

async function buy(interaction) {
  const name = interaction.options.getString('item', true);
  const qty = interaction.options.getInteger('amount') || 1;
  const item = eco.getItem(interaction.guildId, name);
  if (!item) throw new UserError('That item is not in the shop.');
  if (item.require_role_id && !interaction.member.roles.cache.has(item.require_role_id)) {
    throw new UserError('You need the required role before you can buy that.');
  }
  const settings = eco.settings(interaction.guildId);
  if (settings.confirm_buy) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`shop:buy:${item.id}:${qty}`)
        .setLabel('Buy')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('shop:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      content: `Buy **${qty} ${item.name}** for ${formatMoney(item.price * qty, settings.symbol)}?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await completeBuy(interaction, item.id, qty);
}

async function completeBuy(interaction, itemId, qty) {
  const item = eco.getItemById(itemId);
  if (item && item.require_role_id && !interaction.member.roles.cache.has(item.require_role_id)) {
    throw new UserError('You need the required role before you can buy that.');
  }
  const result = finish(eco.purchase(interaction.guildId, interaction.user.id, Number(itemId), Number(qty)));
  const symbol = eco.settings(interaction.guildId).symbol;
  const text = `Bought **${qty} ${result.item.name}** for ${formatMoney(result.cost, symbol)}. You have ${formatMoney(result.balance, symbol)}. Use it with \`/shop use\`.`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: text, components: [] });
    return;
  }
  await interaction.reply({ content: text });
}

async function useItem(interaction) {
  const name = interaction.options.getString('item', true);
  const stack = eco.peekItem(interaction.guildId, interaction.user.id, name);
  if (!stack) throw new UserError('You do not have that item.');
  const grant = stack.role_id ? interaction.guild.roles.cache.get(stack.role_id) : null;
  const remove = stack.remove_role_id ? interaction.guild.roles.cache.get(stack.remove_role_id) : null;
  const hadRemove = Boolean(remove && interaction.member.roles.cache.has(remove.id));
  if (stack.role_id && !grant) throw new UserError('The role on that item no longer exists.');
  if (grant) {
    const error = roleAssignmentError(interaction.guild, grant);
    if (error) throw new UserError(error);
  }
  if (hadRemove) {
    const error = roleAssignmentError(interaction.guild, remove);
    if (error) throw new UserError(error);
  }
  await interaction.deferReply();
  const taken = finish(eco.takeItem(interaction.guildId, interaction.user.id, name));
  try {
    if (grant) await interaction.member.roles.add(grant);
    if (hadRemove) await interaction.member.roles.remove(remove);
  } catch (error) {
    eco.restoreItem(interaction.guildId, interaction.user.id, taken);
    throw error;
  }
  const bits = [taken.reply || `You used **${taken.name}**.`];
  if (grant) bits.push(`You have <@&${grant.id}>.`);
  if (hadRemove) bits.push(`Removed <@&${remove.id}>.`);
  await interaction.editReply({ content: bits.join(' '), allowedMentions: { parse: [] } });
}

async function inventory(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const rows = eco.inventoryOf(interaction.guildId, user.id);
  const embed = new EmbedBuilder().setColor(ACCENT).setTitle(`${user.username}'s inventory`);
  if (!rows.length) embed.setDescription('Nothing in this inventory yet.');
  else {
    const lines = rows.slice(0, 20).map((row) => `**${row.name}** × ${row.quantity}`);
    if (rows.length > 20) lines.push(`And ${rows.length - 20} more.`);
    embed.setDescription(lines.join('\n'));
  }
  await interaction.reply({ embeds: [embed] });
}

async function add(interaction) {
  requireManager(interaction);
  const name = itemName(interaction.options.getString('name', true));
  if (!name) throw new UserError('Use an item name up to 32 characters, without @ or #.');
  const role = interaction.options.getRole('role');
  const description = interaction.options.getString('description');
  const reply = interaction.options.getString('reply');
  const result = finish(eco.addItem({
    guildId: interaction.guildId,
    name,
    price: interaction.options.getInteger('price', true),
    stock: interaction.options.getInteger('stock', true),
    description: description ? description.slice(0, 200) : null,
    reply: reply ? reply.slice(0, 500) : null,
    role_id: assertAssignable(interaction.guild, role),
  }));
  const stock = result.stock == null ? 'unlimited' : String(result.stock);
  await interaction.reply({
    content: `Added **${result.name}** at ${formatMoney(result.price, eco.settings(interaction.guildId).symbol)}. Stock: ${stock}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function remove(interaction) {
  requireManager(interaction);
  const result = finish(eco.removeItem(interaction.guildId, interaction.options.getString('item', true)));
  await interaction.reply({
    content: `Removed **${result.name}** from the shop. Items already bought stay in inventories.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function edit(interaction, sub) {
  requireManager(interaction);
  const current = interaction.options.getString('item', true);
  const patch = {};
  if (sub === 'edit-name') {
    const name = itemName(interaction.options.getString('name', true));
    if (!name) throw new UserError('Use an item name up to 32 characters, without @ or #.');
    patch.name = name;
  }
  if (sub === 'edit-price') patch.price = interaction.options.getInteger('amount', true);
  if (sub === 'edit-stock') patch.stock = interaction.options.getInteger('amount', true);
  if (sub === 'edit-description') {
    const text = interaction.options.getString('description');
    patch.description = !text || text === '-' ? null : text.slice(0, 200);
  }
  if (sub === 'edit-role') patch.role_id = assertAssignable(interaction.guild, interaction.options.getRole('role'));
  if (sub === 'edit-requirerole') {
    const role = interaction.options.getRole('role');
    if (role?.id === interaction.guild.id) throw new UserError('The @everyone role cannot be required.');
    patch.require_role_id = role?.id || null;
  }
  if (sub === 'edit-removerole') patch.remove_role_id = assertAssignable(interaction.guild, interaction.options.getRole('role'));
  if (sub === 'edit-reply') {
    const text = interaction.options.getString('reply');
    patch.reply = !text || text === '-' ? null : text.slice(0, 500);
  }
  if (sub === 'edit-give') patch.giftable = interaction.options.getBoolean('disabled', true) ? 0 : 1;
  const result = finish(eco.patchItem(interaction.guildId, current, patch));
  await interaction.reply({
    content: `Updated **${result.name}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'view') return view(interaction);
  if (sub === 'buy') return buy(interaction);
  if (sub === 'use') return useItem(interaction);
  if (sub === 'inventory') return inventory(interaction);
  if (sub === 'add') return add(interaction);
  if (sub === 'remove') return remove(interaction);
  if (sub.startsWith('edit-')) return edit(interaction, sub);
  throw new UserError('That shop action is not available.');
}

async function autocomplete(interaction) {
  const sub = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused().toLowerCase();
  const names = sub === 'use'
    ? eco.inventoryNames(interaction.guildId, interaction.user.id)
    : eco.shopNames(interaction.guildId);
  const choices = names
    .filter((name) => name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((name) => ({ name, value: name }));
  await interaction.respond(choices);
}

async function handleButton(interaction) {
  const [scope, action, first, second] = interaction.customId.split(':');
  if (scope !== 'shop') return;
  if (action === 'page') {
    await interaction.update(renderShop(interaction.guildId, Number(first) || 1));
    return;
  }
  if (action === 'cancel') {
    await interaction.update({ content: 'Purchase cancelled.', components: [] });
    return;
  }
  if (action === 'buy') {
    await interaction.deferUpdate();
    await completeBuy(interaction, first, second);
  }
}

module.exports = { execute, autocomplete, handleButton };
