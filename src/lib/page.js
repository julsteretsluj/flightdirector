'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { INK } = require('./parse');

const BLANK_SELF = [
  'Your page is blank.',
  '',
  '`/profile edit` adds a name, a one-line intro, and a short bio.',
  '`/profile link-add` stacks a link under the page.',
  '`/profile style` sets the color and banner.',
].join('\n');

function untouched(profile) {
  return !profile;
}

function pageBody(profile) {
  if (!profile) return null;
  const parts = [];
  if (profile.pronouns) parts.push(`*${profile.pronouns}*`);
  if (profile.tagline) parts.push(profile.tagline);
  if (profile.bio) {
    if (parts.length) parts.push('———');
    parts.push(profile.bio);
  }
  return parts.join('\n\n') || null;
}

function renderPage(user, profile, viewerId) {
  const self = user.id === viewerId;
  const title = (profile?.display_name || user.globalName || user.username || 'Page')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 256);
  const embed = new EmbedBuilder()
    .setColor(profile?.accent ?? INK)
    .setTitle(title || 'Page')
    .setThumbnail(user.displayAvatarURL({ size: 256 }));

  const body = pageBody(profile);
  if (body) embed.setDescription(body);
  else if (untouched(profile)) embed.setDescription(self ? BLANK_SELF : 'No page yet.');

  if (profile?.banner_url) embed.setImage(profile.banner_url);

  const footer = [];
  if (profile?.location) footer.push(profile.location.replace(/\s+/g, ' ').trim());
  footer.push(`@${user.username}`);
  embed.setFooter({ text: footer.join('  ·  ').slice(0, 2048) });

  const components = (profile?.links || []).slice(0, 5).map((link) => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(link.label.slice(0, 80))
      .setURL(link.url),
  ));

  return { embeds: [embed], components };
}

module.exports = { BLANK_SELF, pageBody, renderPage };
