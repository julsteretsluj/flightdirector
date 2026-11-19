'use strict';

const { EmbedBuilder } = require('discord.js');

function emptyPayload() {
  return {
    title: null,
    description: null,
    url: null,
    color: null,
    author: null,
    footer: null,
    thumbnail: null,
    image: null,
    fields: [],
    timestamp: false,
  };
}

function isEmptyPayload(payload) {
  if (!payload) return true;
  return !payload.title
    && !payload.description
    && !payload.author?.name
    && !payload.footer?.text
    && !payload.thumbnail
    && !payload.image
    && !(payload.fields || []).length;
}

function buildStoredEmbed(payload) {
  const embed = new EmbedBuilder();
  if (payload.color != null) embed.setColor(payload.color);
  if (payload.title) embed.setTitle(payload.title);
  if (payload.description) embed.setDescription(payload.description);
  if (payload.url) embed.setURL(payload.url);
  if (payload.author?.name) {
    embed.setAuthor({
      name: payload.author.name,
      iconURL: payload.author.iconURL || undefined,
      url: payload.author.url || undefined,
    });
  }
  if (payload.footer?.text) {
    embed.setFooter({
      text: payload.footer.text,
      iconURL: payload.footer.iconURL || undefined,
    });
  }
  if (payload.thumbnail) embed.setThumbnail(payload.thumbnail);
  if (payload.image) embed.setImage(payload.image);
  if (payload.fields?.length) {
    embed.addFields(payload.fields.map((field) => ({
      name: field.name,
      value: field.value,
      inline: Boolean(field.inline),
    })));
  }
  if (payload.timestamp) embed.setTimestamp();
  return embed;
}

module.exports = { emptyPayload, isEmptyPayload, buildStoredEmbed };
