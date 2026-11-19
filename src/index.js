'use strict';

const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { token } = require('./config');
const { loadCommands } = require('./load-commands');
const { handleInteraction } = require('./handlers/interaction');
const { handleReaction } = require('./features/reaction-roles');
const { sweepPolls } = require('./features/polls');
const { sweepFocus } = require('./features/focus');
const { handleProxy } = require('./features/system');
const automod = require('./features/automod');
const logger = require('./features/logger');
const { stop: stopAmbient } = require('./features/ambient');
const cash = require('./features/cash');
const greet = require('./features/greet');
const autoresponder = require('./features/autoresponder');
const verify = require('./features/verify');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
  allowedMentions: { parse: [] },
});

client.commands = loadCommands();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  const tick = () => {
    sweepPolls(readyClient).catch((error) => console.error(error));
    sweepFocus(readyClient).catch((error) => console.error(error));
    cash.sweepEconomy(readyClient).catch((error) => console.error(error));
  };
  tick();
  setInterval(tick, 15_000).unref?.();
});

client.on(Events.MessageCreate, (message) => {
  automod.handleMessage(message)
    .then(async (removed) => {
      if (removed) return;
      const proxied = await handleProxy(message);
      if (proxied) return;
      await autoresponder.handleMessage(message);
    })
    .catch((error) => console.error(error));
});

client.on(Events.MessageDelete, (message) => {
  logger.handleDelete(message).catch((error) => console.error(error));
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  logger.handleEdit(oldMessage, newMessage).catch((error) => console.error(error));
});

client.on(Events.MessageBulkDelete, (messages, channel) => {
  logger.handleBulk(messages, channel).catch((error) => console.error(error));
});

client.on(Events.GuildMemberAdd, (member) => {
  automod.handleJoin(member).catch((error) => console.error(error));
  try { cash.onJoin(member); } catch (error) { console.error(error); }
  verify.onJoin(member).catch((error) => console.error(error));
  greet.handleJoin(member).catch((error) => console.error(error));
});

client.on(Events.GuildMemberRemove, (member) => {
  try { cash.onLeave(member); } catch (error) { console.error(error); }
  greet.handleLeave(member).catch((error) => console.error(error));
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  if (oldMember.partial) return;
  if (!oldMember.premiumSince && newMember.premiumSince) {
    greet.handleBoost(newMember).catch((error) => console.error(error));
  }
});

client.on(Events.VoiceStateUpdate, (oldState) => {
  const me = oldState.guild.members.me;
  if (!me?.voice.channel || oldState.id === me.id) return;
  if (oldState.channelId !== me.voice.channelId) return;
  const people = me.voice.channel.members.filter((member) => !member.user.bot).size;
  if (people === 0) stopAmbient(oldState.guild.id);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction, client).catch((error) => console.error(error));
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  handleReaction(reaction, user, true).catch((error) => console.error(error));
});

client.on(Events.MessageReactionRemove, (reaction, user) => {
  handleReaction(reaction, user, false).catch((error) => console.error(error));
});

client.login(token).catch((error) => {
  const text = String(error?.message || error);
  if (text.toLowerCase().includes('disallowed intent')) {
    console.error('Enable Message Content and Server Members in the Discord developer portal, under Bot, then restart.');
  }
  console.error('Login failed. Check DISCORD_TOKEN.', text);
  process.exit(1);
});
