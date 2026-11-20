'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { guildCommand } = require('../lib/command');
const db = require('../db');
const { UserError } = require('../lib/errors');
const { parseColor, parseHttpUrl, embedName, clearedText } = require('../lib/parse');
const { ephemeral, sendableError, humanize } = require('../lib/discord');
const { emptyPayload, isEmptyPayload, buildStoredEmbed } = require('../lib/stored-embed');
const { presetPayload } = require('../lib/presets');
const { fillPayload, memberContext } = require('../lib/templates');

function nameOption() {
  return (option) => option
    .setName('name')
    .setDescription('Saved embed name')
    .setRequired(true)
    .setMaxLength(32)
    .setAutocomplete(true);
}

function requireName(interaction) {
  const name = embedName(interaction.options.getString('name', true));
  if (!name) throw new UserError('Use a name of lowercase letters, numbers, and hyphens, up to 32 characters.');
  return name;
}

function requireExisting(interaction) {
  const name = requireName(interaction);
  const row = db.getEmbed(interaction.guildId, name);
  if (!row) throw new UserError(`No embed named \`${name}\`. Create it with \`/embed create\`.`);
  return row;
}

module.exports = {
  data: guildCommand('embed', 'Build an embed once, then send it anywhere.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) => sub
      .setName('create')
      .setDescription('Save a new embed')
      .addStringOption(nameOption())
      .addStringOption((option) => option.setName('title').setDescription('Embed title').setMaxLength(256))
      .addStringOption((option) => option.setName('description').setDescription('Embed text').setMaxLength(4000))
      .addStringOption((option) => option.setName('color').setDescription('Hex color like #007AFF').setMaxLength(20))
      .addBooleanOption((option) => option.setName('timestamp').setDescription('Show the time it is sent')))
    .addSubcommand((sub) => sub
      .setName('edit')
      .setDescription('Change the title, text, color, or link')
      .addStringOption(nameOption())
      .addStringOption((option) => option.setName('title').setDescription('New title, or none to clear').setMaxLength(256))
      .addStringOption((option) => option.setName('description').setDescription('New text, or none to clear').setMaxLength(4000))
      .addStringOption((option) => option.setName('color').setDescription('Hex color like #007AFF, or none').setMaxLength(20))
      .addStringOption((option) => option.setName('url').setDescription('Title link, or none to clear').setMaxLength(512))
      .addBooleanOption((option) => option.setName('timestamp').setDescription('Show the time it is sent')))
    .addSubcommand((sub) => sub
      .setName('field-add')
      .setDescription('Add a field')
      .addStringOption(nameOption())
      .addStringOption((option) => option.setName('label').setDescription('Field title').setRequired(true).setMaxLength(256))
      .addStringOption((option) => option.setName('value').setDescription('Field text').setRequired(true).setMaxLength(1024))
      .addBooleanOption((option) => option.setName('inline').setDescription('Sit this field beside others')))
    .addSubcommand((sub) => sub
      .setName('field-remove')
      .setDescription('Remove a field by its number')
      .addStringOption(nameOption())
      .addIntegerOption((option) => option
        .setName('index')
        .setDescription('Field number from /embed fields')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(25)))
    .addSubcommand((sub) => sub
      .setName('fields')
      .setDescription('List fields with their numbers')
      .addStringOption(nameOption()))
    .addSubcommand((sub) => sub
      .setName('media')
      .setDescription('Set the thumbnail or image')
      .addStringOption(nameOption())
      .addStringOption((option) => option.setName('thumbnail').setDescription('Small image URL, or none to clear').setMaxLength(512))
      .addStringOption((option) => option.setName('image').setDescription('Large image URL, or none to clear').setMaxLength(512)))
    .addSubcommand((sub) => sub
      .setName('author')
      .setDescription('Set the author line')
      .addStringOption(nameOption())
      .addStringOption((option) => option.setName('author').setDescription('Author name, or none to clear').setMaxLength(256))
      .addStringOption((option) => option.setName('icon').setDescription('Author icon URL, or none to clear').setMaxLength(512))
      .addStringOption((option) => option.setName('url').setDescription('Author link, or none to clear').setMaxLength(512)))
    .addSubcommand((sub) => sub
      .setName('footer')
      .setDescription('Set the footer')
      .addStringOption(nameOption())
      .addStringOption((option) => option.setName('text').setDescription('Footer text, or none to clear').setMaxLength(2048))
      .addStringOption((option) => option.setName('icon').setDescription('Footer icon URL, or none to clear').setMaxLength(512)))
    .addSubcommand((sub) => sub
      .setName('preset')
      .setDescription('Save the rules, the sector map, or the welcome')
      .addStringOption((option) => option
        .setName('preset')
        .setDescription('Which ready-made embed')
        .setRequired(true)
        .addChoices(
          { name: 'rules', value: 'rules' },
          { name: 'map', value: 'map' },
          { name: 'welcome', value: 'welcome' },
        ))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Also post it here')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub
      .setName('preview')
      .setDescription('Preview an embed privately')
      .addStringOption(nameOption()))
    .addSubcommand((sub) => sub
      .setName('send')
      .setDescription('Send a saved embed')
      .addStringOption(nameOption())
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to send it')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('List saved embeds'))
    .addSubcommand((sub) => sub
      .setName('delete')
      .setDescription('Delete a saved embed')
      .addStringOption(nameOption())),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'name' || !interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const query = focused.value.toLowerCase();
    const choices = db.embedNames(interaction.guildId)
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({ name, value: name }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return create(interaction);
    if (sub === 'edit') return edit(interaction);
    if (sub === 'field-add') return addField(interaction);
    if (sub === 'field-remove') return removeField(interaction);
    if (sub === 'fields') return listFields(interaction);
    if (sub === 'media') return media(interaction);
    if (sub === 'author') return author(interaction);
    if (sub === 'footer') return footer(interaction);
    if (sub === 'preset') return usePreset(interaction);
    if (sub === 'preview') return preview(interaction);
    if (sub === 'send') return send(interaction);
    if (sub === 'list') return list(interaction);
    if (sub === 'delete') return remove(interaction);
    throw new Error(`Unknown embed subcommand ${sub}`);
  },
};

async function create(interaction) {
  const name = requireName(interaction);
  if (db.getEmbed(interaction.guildId, name)) {
    throw new UserError(`\`${name}\` already exists. Edit it with \`/embed edit\`.`);
  }
  const payload = emptyPayload();
  payload.title = interaction.options.getString('title')?.trim() || null;
  payload.description = interaction.options.getString('description')?.trim() || null;
  const color = parseColor(interaction.options.getString('color'));
  if (color && typeof color === 'object') throw new UserError(color.error);
  if (color !== undefined) payload.color = color;
  payload.timestamp = Boolean(interaction.options.getBoolean('timestamp'));
  db.createEmbed(interaction.guildId, name, payload, interaction.user.id);
  await interaction.reply(ephemeral(`Saved \`${name}\`. Preview it with \`/embed preview\`.`));
}

async function edit(interaction) {
  const row = requireExisting(interaction);
  const payload = row.payload;
  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const colorInput = interaction.options.getString('color');
  const urlInput = interaction.options.getString('url');
  const timestamp = interaction.options.getBoolean('timestamp');
  if (title == null && description == null && colorInput == null && urlInput == null && timestamp == null) {
    throw new UserError('Change a title, description, color, link, or timestamp.');
  }
  payload.title = clearedText(title, payload.title);
  payload.description = clearedText(description, payload.description);
  if (colorInput != null) {
    const color = parseColor(colorInput);
    if (color && typeof color === 'object') throw new UserError(color.error);
    payload.color = color;
  }
  if (urlInput != null) {
    const url = parseHttpUrl(urlInput, { allowClear: true });
    if (url && typeof url === 'object') throw new UserError(url.error);
    payload.url = url;
  }
  if (timestamp != null) payload.timestamp = timestamp;
  db.saveEmbedPayload(interaction.guildId, row.name, payload);
  await interaction.reply(ephemeral(`Updated \`${row.name}\`.`));
}

async function addField(interaction) {
  const row = requireExisting(interaction);
  const payload = row.payload;
  if ((payload.fields || []).length >= 25) throw new UserError('An embed can hold 25 fields.');
  const label = interaction.options.getString('label', true).trim();
  const value = interaction.options.getString('value', true).trim();
  if (!label) throw new UserError('Give the field a title.');
  if (!value) throw new UserError('Give the field some text.');
  payload.fields = payload.fields || [];
  payload.fields.push({
    name: label,
    value,
    inline: Boolean(interaction.options.getBoolean('inline')),
  });
  db.saveEmbedPayload(interaction.guildId, row.name, payload);
  await interaction.reply(ephemeral(`Added field ${payload.fields.length} to \`${row.name}\`.`));
}

async function removeField(interaction) {
  const row = requireExisting(interaction);
  const payload = row.payload;
  const index = interaction.options.getInteger('index', true);
  if (!payload.fields?.length || index > payload.fields.length) {
    throw new UserError(`\`${row.name}\` does not have a field ${index}.`);
  }
  const [removed] = payload.fields.splice(index - 1, 1);
  db.saveEmbedPayload(interaction.guildId, row.name, payload);
  await interaction.reply(ephemeral(`Removed **${removed.name}** from \`${row.name}\`.`));
}

async function listFields(interaction) {
  const row = requireExisting(interaction);
  const fields = row.payload.fields || [];
  if (!fields.length) {
    await interaction.reply(ephemeral(`\`${row.name}\` has no fields.`));
    return;
  }
  const lines = fields.map((field, index) => `**${index + 1}.** ${field.name}${field.inline ? ' · inline' : ''}`);
  await interaction.reply(ephemeral(lines.join('\n').slice(0, 1900)));
}

function readUrl(interaction, key) {
  const raw = interaction.options.getString(key);
  if (raw == null) return undefined;
  const url = parseHttpUrl(raw, { allowClear: true });
  if (url && typeof url === 'object') throw new UserError(url.error);
  return url;
}

async function media(interaction) {
  const row = requireExisting(interaction);
  const thumbnail = readUrl(interaction, 'thumbnail');
  const image = readUrl(interaction, 'image');
  if (thumbnail === undefined && image === undefined) {
    throw new UserError('Set a thumbnail, an image, or both.');
  }
  if (thumbnail !== undefined) row.payload.thumbnail = thumbnail;
  if (image !== undefined) row.payload.image = image;
  db.saveEmbedPayload(interaction.guildId, row.name, row.payload);
  await interaction.reply(ephemeral(`Updated the images on \`${row.name}\`.`));
}

async function author(interaction) {
  const row = requireExisting(interaction);
  const name = interaction.options.getString('author');
  const icon = readUrl(interaction, 'icon');
  const url = readUrl(interaction, 'url');
  if (name == null && icon === undefined && url === undefined) {
    throw new UserError('Set an author name, icon, or link.');
  }
  if (name != null && (name.trim() === '-' || name.trim().toLowerCase() === 'none')) {
    row.payload.author = null;
    db.saveEmbedPayload(interaction.guildId, row.name, row.payload);
    await interaction.reply(ephemeral(`Cleared the author on \`${row.name}\`.`));
    return;
  }
  const current = row.payload.author || { name: null, iconURL: null, url: null };
  current.name = clearedText(name, current.name);
  if (icon !== undefined) current.iconURL = icon;
  if (url !== undefined) current.url = url;
  if ((current.iconURL || current.url) && !current.name) {
    throw new UserError('Add an author name before an icon or link.');
  }
  row.payload.author = current.name ? current : null;
  db.saveEmbedPayload(interaction.guildId, row.name, row.payload);
  await interaction.reply(ephemeral(`Updated the author on \`${row.name}\`.`));
}

async function footer(interaction) {
  const row = requireExisting(interaction);
  const text = interaction.options.getString('text');
  const icon = readUrl(interaction, 'icon');
  if (text == null && icon === undefined) throw new UserError('Set footer text or an icon.');
  if (text != null && (text.trim() === '-' || text.trim().toLowerCase() === 'none')) {
    row.payload.footer = null;
    db.saveEmbedPayload(interaction.guildId, row.name, row.payload);
    await interaction.reply(ephemeral(`Cleared the footer on \`${row.name}\`.`));
    return;
  }
  const current = row.payload.footer || { text: null, iconURL: null };
  current.text = clearedText(text, current.text);
  if (icon !== undefined) current.iconURL = icon;
  if (current.iconURL && !current.text) throw new UserError('Add footer text before an icon.');
  row.payload.footer = current.text ? current : null;
  db.saveEmbedPayload(interaction.guildId, row.name, row.payload);
  await interaction.reply(ephemeral(`Updated the footer on \`${row.name}\`.`));
}

async function usePreset(interaction) {
  const name = interaction.options.getString('preset', true);
  const payload = presetPayload(name);
  if (!payload) throw new UserError('That preset is not on this bot.');
  if (db.getEmbed(interaction.guildId, name)) {
    db.saveEmbedPayload(interaction.guildId, name, payload);
  } else {
    db.createEmbed(interaction.guildId, name, payload, interaction.user.id);
  }
  const channel = interaction.options.getChannel('channel');
  if (channel) {
    const problem = sendableError(channel, interaction.guild.members.me);
    if (problem) throw new UserError(problem);
    try {
      await channel.send({
        embeds: [buildStoredEmbed(shownEmbed(payload, interaction))],
        allowedMentions: { users: [interaction.user.id], parse: [] },
      });
    } catch (error) {
      throw new UserError(humanize(error) || 'Discord rejected that embed.');
    }
  }
  const next = name === 'welcome'
    ? ' Turn it on with `/greet channel` and `/greet message message:{embed:welcome}`.'
    : ' Preview it with `/embed preview`, or send it with `/embed send`.';
  const posted = channel ? ` Sent it to ${channel}.` : next;
  await interaction.reply(ephemeral(`Saved \`${name}\`.${posted}`));
}

function shownEmbed(payload, interaction) {
  if (!interaction.member) return payload;
  return fillPayload(payload, memberContext(interaction.member));
}

async function preview(interaction) {
  const row = requireExisting(interaction);
  if (isEmptyPayload(row.payload)) throw new UserError(`\`${row.name}\` is still empty.`);
  await interaction.reply({
    content: `Preview of \`${row.name}\`.`,
    embeds: [buildStoredEmbed(shownEmbed(row.payload, interaction))],
    flags: ephemeral().flags,
    allowedMentions: { users: [interaction.user.id], parse: [] },
  });
}

async function send(interaction) {
  const row = requireExisting(interaction);
  if (isEmptyPayload(row.payload)) throw new UserError(`\`${row.name}\` is still empty.`);
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const problem = sendableError(channel, interaction.guild.members.me);
  if (problem) throw new UserError(problem);
  try {
    await channel.send({
      embeds: [buildStoredEmbed(shownEmbed(row.payload, interaction))],
      allowedMentions: { users: [interaction.user.id], parse: [] },
    });
  } catch (error) {
    throw new UserError(humanize(error) || 'Discord rejected that embed. Check the image URLs.');
  }
  await interaction.reply(ephemeral(`Sent \`${row.name}\` to ${channel}.`));
}

async function list(interaction) {
  const names = db.embedNames(interaction.guildId);
  if (!names.length) {
    await interaction.reply(ephemeral('No saved embeds yet. Create one with `/embed create`.'));
    return;
  }
  const shown = names.slice(0, 50).map((name) => `\`${name}\``).join(', ');
  const extra = names.length > 50 ? `\nAnd ${names.length - 50} more.` : '';
  await interaction.reply(ephemeral(`${shown}${extra}`));
}

async function remove(interaction) {
  const name = requireName(interaction);
  const removed = db.deleteEmbed(interaction.guildId, name);
  if (!removed) throw new UserError(`No embed named \`${name}\`.`);
  await interaction.reply(ephemeral(`Deleted \`${name}\`.`));
}
