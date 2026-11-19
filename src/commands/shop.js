'use strict';

const shop = require('../features/shop');
const { guildCommand } = require('../lib/command');

function itemOption(description) {
  return (option) => option
    .setName('item')
    .setDescription(description)
    .setRequired(true)
    .setMaxLength(32)
    .setAutocomplete(true);
}

function roleOption(description) {
  return (option) => option.setName('role').setDescription(description).setRequired(false);
}

module.exports = {
  data: guildCommand('shop', 'Server shop: browse, buy, use, and manage items.')
    .addSubcommand((sub) => sub
      .setName('view')
      .setDescription('Show the shop')
      .addIntegerOption((option) => option.setName('page').setDescription('Page number').setMinValue(1)))
    .addSubcommand((sub) => sub
      .setName('buy')
      .setDescription('Buy an item')
      .addStringOption(itemOption('Item to buy'))
      .addIntegerOption((option) => option.setName('amount').setDescription('How many').setMinValue(1).setMaxValue(100)))
    .addSubcommand((sub) => sub
      .setName('use')
      .setDescription('Use an item from your inventory')
      .addStringOption(itemOption('Item to use')))
    .addSubcommand((sub) => sub
      .setName('inventory')
      .setDescription('Show an inventory')
      .addUserOption((option) => option.setName('user').setDescription('Whose inventory')))
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Add an item. Stock 0 means unlimited')
      .addStringOption((option) => option.setName('name').setDescription('Item name').setRequired(true).setMaxLength(32))
      .addIntegerOption((option) => option.setName('price').setDescription('Price').setRequired(true).setMinValue(0).setMaxValue(1_000_000_000))
      .addIntegerOption((option) => option.setName('stock').setDescription('Stock, or 0 for unlimited').setRequired(true).setMinValue(0).setMaxValue(1_000_000_000))
      .addRoleOption(roleOption('Role granted when the item is used'))
      .addStringOption((option) => option.setName('description').setDescription('Shop listing').setMaxLength(200))
      .addStringOption((option) => option.setName('reply').setDescription('Message shown when the item is used').setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Remove an item from the shop')
      .addStringOption(itemOption('Item to remove')))
    .addSubcommand((sub) => sub
      .setName('edit-name')
      .setDescription('Rename an item')
      .addStringOption(itemOption('Current item'))
      .addStringOption((option) => option.setName('name').setDescription('New name').setRequired(true).setMaxLength(32)))
    .addSubcommand((sub) => sub
      .setName('edit-price')
      .setDescription('Change an item price')
      .addStringOption(itemOption('Item'))
      .addIntegerOption((option) => option.setName('amount').setDescription('New price').setRequired(true).setMinValue(0).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('edit-stock')
      .setDescription('Change stock. 0 means unlimited')
      .addStringOption(itemOption('Item'))
      .addIntegerOption((option) => option.setName('amount').setDescription('New stock, or 0 for unlimited').setRequired(true).setMinValue(0).setMaxValue(1_000_000_000)))
    .addSubcommand((sub) => sub
      .setName('edit-description')
      .setDescription('Change the listing. Empty or - clears it')
      .addStringOption(itemOption('Item'))
      .addStringOption((option) => option.setName('description').setDescription('New description, or - to clear').setMaxLength(200)))
    .addSubcommand((sub) => sub
      .setName('edit-role')
      .setDescription('Role granted on use. Leave empty to clear')
      .addStringOption(itemOption('Item'))
      .addRoleOption(roleOption('Role granted on use, or empty to clear')))
    .addSubcommand((sub) => sub
      .setName('edit-requirerole')
      .setDescription('Role required to buy. Leave empty to clear')
      .addStringOption(itemOption('Item'))
      .addRoleOption(roleOption('Role required to buy, or empty to clear')))
    .addSubcommand((sub) => sub
      .setName('edit-removerole')
      .setDescription('Role removed on use. Leave empty to clear')
      .addStringOption(itemOption('Item'))
      .addRoleOption(roleOption('Role removed on use, or empty to clear')))
    .addSubcommand((sub) => sub
      .setName('edit-reply')
      .setDescription('Reply shown on use. Empty or - clears it')
      .addStringOption(itemOption('Item'))
      .addStringOption((option) => option.setName('reply').setDescription('Reply, or - to clear').setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('edit-give')
      .setDescription('Allow or block gifting this item')
      .addStringOption(itemOption('Item'))
      .addBooleanOption((option) => option.setName('disabled').setDescription('True blocks /cash give-item').setRequired(true))),
  autocomplete: shop.autocomplete,
  execute: shop.execute,
};
