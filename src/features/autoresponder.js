'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const eco = require('../store-economy');
const { UserError } = require('../lib/errors');
const { ACCENT } = require('../lib/parse');
const { requireManager } = require('../lib/discord');
const { pickResponder } = require('../lib/economy');
const { messageContext, renderFilled } = require('../lib/templates');

function cleanTrigger(raw) {
  const trigger = String(raw || '').replace(/\s+/g, ' ').trim();
  if (trigger.length < 1 || trigger.length > 80) return null;
  return trigger;
}

async function execute(interaction) {
  requireManager(interaction);
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'list') {
    const rows = eco.listResponders(guildId);
    const embed = new EmbedBuilder().setColor(ACCENT).setTitle('Autoresponders');
    if (!rows.length) embed.setDescription('None yet. `/autoresponder add` creates one.');
    else {
      const lines = rows.slice(0, 20).map((row) => `**${row.trigger}** · ${row.match_mode}`);
      if (rows.length > 20) lines.push(`And ${rows.length - 20} more.`);
      embed.setDescription(lines.join('\n'));
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const trigger = cleanTrigger(interaction.options.getString('trigger', true));
  if (!trigger) throw new UserError('Use a trigger up to 80 characters.');

  if (sub === 'add') {
    const reply = interaction.options.getString('reply', true).trim();
    if (!reply) throw new UserError('Write a reply.');
    const mode = interaction.options.getString('match') || 'contains';
    eco.upsertResponder(guildId, trigger, reply.slice(0, 1000), mode);
    await interaction.reply({ content: `Saved **${trigger}** (${mode}).`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'reply') {
    const reply = interaction.options.getString('reply', true).trim();
    if (!reply) throw new UserError('Write a reply.');
    const row = eco.updateResponder(guildId, trigger, { reply: reply.slice(0, 1000) });
    if (!row) throw new UserError('No autoresponder uses that trigger.');
    await interaction.reply({ content: `Updated the reply for **${row.trigger}**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'match') {
    const row = eco.updateResponder(guildId, trigger, { match_mode: interaction.options.getString('mode', true) });
    if (!row) throw new UserError('No autoresponder uses that trigger.');
    await interaction.reply({ content: `**${row.trigger}** now matches ${row.match_mode}.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'show') {
    const row = eco.getResponder(guildId, trigger);
    if (!row) throw new UserError('No autoresponder uses that trigger.');
    const embed = new EmbedBuilder()
      .setColor(ACCENT)
      .setTitle(row.trigger)
      .setDescription(row.reply.slice(0, 4000))
      .setFooter({ text: row.match_mode });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'remove') {
    const removed = eco.removeResponder(guildId, trigger);
    if (!removed) throw new UserError('No autoresponder uses that trigger.');
    await interaction.reply({ content: `Removed **${trigger}**.`, flags: MessageFlags.Ephemeral });
  }
}

async function handleMessage(message) {
  if (!message.guild || message.author?.bot || message.webhookId || message.system) return;
  const content = message.content || '';
  if (!content) return;
  const match = pickResponder(eco.listResponders(message.guild.id), content);
  if (!match) return;
  const rendered = renderFilled(message.guild.id, match.reply, messageContext(message));
  if (!rendered.content && !rendered.embeds.length) return;
  await message.channel.send({
    content: rendered.content || undefined,
    embeds: rendered.embeds,
    allowedMentions: { users: [message.author.id], parse: [] },
  }).catch((error) => console.error(error));
}

module.exports = { execute, handleMessage };
