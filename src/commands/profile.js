'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { guildCommand } = require('../lib/command');
const db = require('../db');
const { UserError } = require('../lib/errors');
const { INK, parseColor, parseHttpUrl } = require('../lib/parse');
const { ephemeral, sendableError } = require('../lib/discord');
const { renderPage } = require('../lib/page');
const profile = require('../features/profile');

module.exports = {
  data: guildCommand('profile', 'A personal page with a bio and stacked links.')
    .addSubcommand((sub) => sub
      .setName('edit')
      .setDescription('Edit your name, intro, bio, and location'))
    .addSubcommand((sub) => sub
      .setName('style')
      .setDescription('Set the accent color and banner')
      .addStringOption((option) => option
        .setName('color')
        .setDescription('Hex color like #1D1D1F, or none to reset')
        .setMaxLength(20))
      .addStringOption((option) => option
        .setName('banner')
        .setDescription('Banner image URL, or none to clear')
        .setMaxLength(512)))
    .addSubcommand((sub) => sub
      .setName('link-add')
      .setDescription('Add or update a link on your page')
      .addStringOption((option) => option
        .setName('label')
        .setDescription('Text on the button')
        .setRequired(true)
        .setMaxLength(80))
      .addStringOption((option) => option
        .setName('url')
        .setDescription('Where the button goes')
        .setRequired(true)
        .setMaxLength(512)))
    .addSubcommand((sub) => sub
      .setName('link-remove')
      .setDescription('Remove a link by its label')
      .addStringOption((option) => option
        .setName('label')
        .setDescription('Label to remove')
        .setRequired(true)
        .setMaxLength(80)))
    .addSubcommand((sub) => sub
      .setName('link-clear')
      .setDescription('Remove every link from your page'))
    .addSubcommand((sub) => sub
      .setName('view')
      .setDescription('Open a page')
      .addUserOption((option) => option
        .setName('user')
        .setDescription('Whose page to open'))
      .addBooleanOption((option) => option
        .setName('hide')
        .setDescription('Only you can see it')))
    .addSubcommand((sub) => sub
      .setName('post')
      .setDescription('Share your page in a channel')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post it')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub
      .setName('reset')
      .setDescription('Clear your page')
      .addBooleanOption((option) => option
        .setName('confirm')
        .setDescription('Confirm you want to clear it')
        .setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'edit') {
      await profile.openEditor(interaction);
      return;
    }
    if (sub === 'style') return style(interaction);
    if (sub === 'link-add') return addLink(interaction);
    if (sub === 'link-remove') return removeLink(interaction);
    if (sub === 'link-clear') return clearLinks(interaction);
    if (sub === 'view') return view(interaction);
    if (sub === 'post') return post(interaction);
    if (sub === 'reset') return reset(interaction);
    throw new UserError('Unknown profile command.');
  },
};

async function style(interaction) {
  const color = parseColor(interaction.options.getString('color'));
  if (color && typeof color === 'object') throw new UserError(color.error);
  const banner = parseHttpUrl(interaction.options.getString('banner'), { allowClear: true });
  if (banner && typeof banner === 'object') throw new UserError(banner.error);
  if (color === undefined && banner === undefined) {
    throw new UserError('Set a color, a banner, or both.');
  }

  const patch = {};
  if (color !== undefined) patch.accent = color == null ? INK : color;
  if (banner !== undefined) patch.banner_url = banner;
  const saved = db.saveProfile(interaction.user.id, patch);
  await interaction.reply({
    content: 'Updated your page.',
    ...renderPage(interaction.user, saved, interaction.user.id),
    flags: ephemeral().flags,
  });
}

async function addLink(interaction) {
  const label = interaction.options.getString('label', true).trim();
  if (!label) throw new UserError('Give the link a label.');
  const url = parseHttpUrl(interaction.options.getString('url', true));
  if (!url || typeof url === 'object') throw new UserError(url?.error || 'That URL needs to start with http:// or https://.');

  const current = db.getProfile(interaction.user.id);
  const links = [...(current?.links || [])];
  const index = links.findIndex((link) => link.label.toLowerCase() === label.toLowerCase());
  let verb = 'Added';
  if (index === -1) {
    if (links.length >= 5) throw new UserError('A page can stack 5 links. Remove one with `/profile link-remove`.');
    links.push({ label, url });
  } else {
    links[index] = { label, url };
    verb = 'Updated';
  }
  const saved = db.saveProfile(interaction.user.id, { links });
  await interaction.reply({
    content: `${verb} **${label}**.`,
    ...renderPage(interaction.user, saved, interaction.user.id),
    flags: ephemeral().flags,
  });
}

async function removeLink(interaction) {
  const label = interaction.options.getString('label', true).trim();
  const current = db.getProfile(interaction.user.id);
  const links = current?.links || [];
  const next = links.filter((link) => link.label.toLowerCase() !== label.toLowerCase());
  if (next.length === links.length) {
    const known = links.map((link) => link.label).join(', ');
    throw new UserError(known ? `No link named "${label}". This page has ${known}.` : 'This page has no links yet.');
  }
  const saved = db.saveProfile(interaction.user.id, { links: next });
  await interaction.reply({
    content: `Removed **${label}**.`,
    ...renderPage(interaction.user, saved, interaction.user.id),
    flags: ephemeral().flags,
  });
}

async function clearLinks(interaction) {
  const saved = db.saveProfile(interaction.user.id, { links: [] });
  await interaction.reply({
    content: 'Cleared the links.',
    ...renderPage(interaction.user, saved, interaction.user.id),
    flags: ephemeral().flags,
  });
}

async function view(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const hide = Boolean(interaction.options.getBoolean('hide'));
  const page = renderPage(user, db.getProfile(user.id), interaction.user.id);
  if (hide) page.flags = ephemeral().flags;
  await interaction.reply(page);
}

async function post(interaction) {
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const problem = sendableError(channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);
  if (!channel.permissionsFor(interaction.member)?.has(PermissionFlagsBits.SendMessages)) {
    throw new UserError('You cannot send messages in that channel.');
  }
  const page = renderPage(interaction.user, db.getProfile(interaction.user.id), interaction.user.id);
  if (channel.id === interaction.channelId) {
    await interaction.reply(page);
    return;
  }
  await channel.send({ ...page, allowedMentions: { parse: [] } });
  await interaction.reply(ephemeral(`Posted your page in ${channel}.`));
}

async function reset(interaction) {
  if (!interaction.options.getBoolean('confirm')) throw new UserError('Nothing was cleared.');
  const removed = db.deleteProfile(interaction.user.id);
  await interaction.reply(ephemeral(removed ? 'Cleared your page.' : 'Your page was already empty.'));
}
