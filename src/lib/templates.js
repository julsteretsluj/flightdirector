'use strict';

const db = require('../db');
const { neutralizePings } = require('./parse');
const { isEmptyPayload, buildStoredEmbed } = require('./stored-embed');

function fillTemplate(text, ctx) {
  const source = String(text || '');
  return source
    .replaceAll('{user_avatar}', ctx.userAvatar || '')
    .replaceAll('{server_icon}', ctx.serverIcon || '')
    .replaceAll('{user_name}', ctx.userName || '')
    .replaceAll('{user_tag}', ctx.userName || '')
    .replaceAll('{server_name}', ctx.serverName || '')
    .replaceAll('{server_membercount}', String(ctx.memberCount ?? ''))
    .replaceAll('{newline}', '\n')
    .replaceAll('{user}', ctx.user || '');
}

function splitEmbedToken(text) {
  const source = String(text || '');
  const match = source.match(/\{embed:([a-z0-9-]{1,32})\}/i);
  if (!match) return { text: source, embedName: null };
  return {
    text: source.replace(match[0], ' ').replace(/[ \t]{2,}/g, ' ').trim(),
    embedName: match[1].toLowerCase(),
  };
}

function clip(value, max) {
  if (value == null) return null;
  const text = String(value);
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function cleanUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null;
  return value;
}

function fillValue(value, ctx) {
  if (typeof value === 'string') return fillTemplate(value, ctx);
  if (Array.isArray(value)) return value.map((entry) => fillValue(entry, ctx));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = fillValue(entry, ctx);
    return out;
  }
  return value;
}

function sanitizePayload(payload) {
  const next = { ...payload };
  next.title = clip(next.title, 256);
  next.description = clip(next.description, 4096);
  next.url = cleanUrl(next.url);
  if (next.author) {
    const name = clip(next.author.name, 256);
    next.author = name ? { name, iconURL: cleanUrl(next.author.iconURL), url: cleanUrl(next.author.url) } : null;
  }
  if (next.footer) {
    const text = clip(next.footer.text, 2048);
    next.footer = text ? { text, iconURL: cleanUrl(next.footer.iconURL) } : null;
  }
  next.thumbnail = cleanUrl(next.thumbnail);
  next.image = cleanUrl(next.image);
  next.fields = (next.fields || []).slice(0, 25).map((field) => ({
    name: clip(field.name, 256) || '•',
    value: clip(field.value, 1024) || '•',
    inline: Boolean(field.inline),
  }));
  return next;
}

function fillPayload(payload, ctx) {
  return sanitizePayload(fillValue(payload, ctx));
}

function renderFilled(guildId, template, ctx) {
  const split = splitEmbedToken(template);
  let content = neutralizePings(fillTemplate(split.text, ctx)).slice(0, 2000).trim();
  const embeds = [];
  let ping = false;
  if (split.embedName) {
    const row = db.getEmbed(guildId, split.embedName);
    if (row) {
      try {
        ping = Boolean(row.payload.ping);
        const payload = sanitizePayload(fillValue(row.payload, ctx));
        if (!isEmptyPayload(payload)) embeds.push(buildStoredEmbed(payload));
      } catch {
        /* skip a broken embed and still send the text */
      }
    }
  }
  if (ping && ctx.user && !content.includes(ctx.user)) {
    content = content ? `${ctx.user}\n${content}` : ctx.user;
  }
  return { content: content || null, embeds };
}

function memberContext(member) {
  const user = member.user || member;
  return {
    user: `<@${member.id}>`,
    userName: member.displayName || user.username || 'someone',
    userAvatar: member.displayAvatarURL?.({ extension: 'png', size: 256 })
      || user.displayAvatarURL?.({ extension: 'png', size: 256 })
      || '',
    serverName: member.guild?.name || 'the server',
    serverIcon: member.guild?.iconURL?.({ extension: 'png', size: 256 }) || '',
    memberCount: member.guild?.memberCount || 0,
  };
}

function messageContext(message) {
  const member = message.member;
  return {
    user: `<@${message.author.id}>`,
    userName: member?.displayName || message.author.username,
    userAvatar: member?.displayAvatarURL?.({ extension: 'png', size: 256 })
      || message.author.displayAvatarURL({ extension: 'png', size: 256 }),
    serverName: message.guild.name,
    serverIcon: message.guild.iconURL({ extension: 'png', size: 256 }) || '',
    memberCount: message.guild.memberCount,
  };
}

module.exports = {
  fillTemplate,
  fillPayload,
  splitEmbedToken,
  renderFilled,
  memberContext,
  messageContext,
};
