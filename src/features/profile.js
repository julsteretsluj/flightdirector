'use strict';

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db = require('../db');
const { neutralizePings } = require('../lib/parse');
const { ephemeral } = require('../lib/discord');
const { renderPage } = require('../lib/page');

function textRow(customId, label, style, max, value, placeholder) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setMaxLength(max)
    .setRequired(false)
    .setPlaceholder(placeholder);
  if (value) input.setValue(String(value).slice(0, max));
  return new ActionRowBuilder().addComponents(input);
}

function editModal(profile) {
  return new ModalBuilder()
    .setCustomId('profile:edit')
    .setTitle('Edit your page')
    .addComponents(
      textRow('display_name', 'Name', TextInputStyle.Short, 80, profile?.display_name, 'Title of the page. Use - to clear.'),
      textRow('pronouns', 'Pronouns', TextInputStyle.Short, 40, profile?.pronouns, 'Shown under the title. Use - to clear.'),
      textRow('tagline', 'Intro', TextInputStyle.Short, 140, profile?.tagline, 'One sentence. Use - to clear.'),
      textRow('bio', 'About', TextInputStyle.Paragraph, 1000, profile?.bio, 'A short bio. Use - to clear.'),
      textRow('location', 'Location', TextInputStyle.Short, 80, profile?.location, 'Shown quietly at the bottom. Use - to clear.'),
    );
}

function mergeField(submitted, previous) {
  const value = neutralizePings(submitted).trim();
  if (value === '-') return null;
  if (!value) return previous ?? null;
  return value;
}

async function openEditor(interaction) {
  await interaction.showModal(editModal(db.getProfile(interaction.user.id)));
}

async function handleModal(interaction) {
  const current = db.getProfile(interaction.user.id);
  const profile = db.saveProfile(interaction.user.id, {
    display_name: mergeField(interaction.fields.getTextInputValue('display_name'), current?.display_name),
    pronouns: mergeField(interaction.fields.getTextInputValue('pronouns'), current?.pronouns),
    tagline: mergeField(interaction.fields.getTextInputValue('tagline'), current?.tagline),
    bio: mergeField(interaction.fields.getTextInputValue('bio'), current?.bio),
    location: mergeField(interaction.fields.getTextInputValue('location'), current?.location),
  });
  const page = renderPage(interaction.user, profile, interaction.user.id);
  await interaction.reply({
    content: 'Updated your page.',
    ...page,
    flags: ephemeral().flags,
  });
}

function pageReply(user, profile, viewerId, extra = {}) {
  return {
    ...renderPage(user, profile, viewerId),
    ...extra,
  };
}

module.exports = { openEditor, handleModal, pageReply };
