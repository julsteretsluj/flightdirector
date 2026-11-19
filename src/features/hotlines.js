'use strict';

const { EmbedBuilder } = require('discord.js');
const { ACCENT } = require('../lib/parse');
const { ephemeral } = require('../lib/discord');
const { UserError } = require('../lib/errors');

const LINES = [
  {
    country: 'United States',
    aliases: ['us', 'usa'],
    detail: '988 Suicide & Crisis Lifeline. Call or text 988. https://988lifeline.org',
  },
  {
    country: 'Canada',
    aliases: ['ca'],
    detail: '9-8-8 Suicide Crisis Helpline. Call or text 9-8-8. https://988.ca',
  },
  {
    country: 'United Kingdom',
    aliases: ['uk', 'britain', 'england', 'scotland', 'wales'],
    detail: 'Samaritans. Call 116 123. https://www.samaritans.org',
  },
  {
    country: 'Ireland',
    aliases: ['ie'],
    detail: 'Samaritans. Call 116 123. https://www.samaritans.org/ireland/',
  },
  {
    country: 'Australia',
    aliases: ['au'],
    detail: 'Lifeline. Call 13 11 14. https://www.lifeline.org.au',
  },
  {
    country: 'New Zealand',
    aliases: ['nz'],
    detail: 'Need to talk? Call or text 1737. https://1737.org.nz',
  },
];

const DIRECTORIES = [
  'Find a Helpline lists local lines and chats: https://findahelpline.com',
  'IASP keeps a country directory: https://www.iasp.info/suicidalthoughts/',
].join('\n');

function searchLines(query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];
  return LINES.filter((line) => {
    if (line.country.toLowerCase() === needle) return true;
    if ((line.aliases || []).includes(needle)) return true;
    return needle.length >= 5 && line.country.toLowerCase().includes(needle);
  });
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(ACCENT);
  if (sub === 'online') {
    embed
      .setTitle('Crisis resources')
      .setDescription(`${DIRECTORIES}\n\n\`/hotlines search\` checks a short list of lines. For anywhere else, use the directories above.`);
  } else {
    const query = interaction.options.getString('country', true);
    const found = searchLines(query);
    embed.setTitle('Hotlines');
    if (!found.length) {
      embed.setDescription(`I don't have a checked listing for that country.\n\n${DIRECTORIES}`);
    } else {
      embed.setDescription(found.map((line) => `**${line.country}**\n${line.detail}`).join('\n\n'));
    }
  }
  await interaction.reply({ embeds: [embed], flags: ephemeral().flags });
}

module.exports = { execute, searchLines, LINES };
