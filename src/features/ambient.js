'use strict';

const { Readable } = require('stream');
const { PermissionFlagsBits } = require('discord.js');
const { UserError } = require('../lib/errors');
const { ephemeral } = require('../lib/discord');

const sessions = new Map();

class NoiseStream extends Readable {
  constructor() {
    super();
    this.lastLeft = 0;
    this.lastRight = 0;
  }

  _read() {
    const samples = 48_000;
    const buffer = Buffer.allocUnsafe(samples * 4);
    for (let index = 0; index < samples; index++) {
      this.lastLeft = (this.lastLeft * 0.995) + ((Math.random() * 2 - 1) * 0.02);
      this.lastRight = (this.lastRight * 0.995) + ((Math.random() * 2 - 1) * 0.02);
      const left = Math.max(-1, Math.min(1, this.lastLeft)) * 0.18;
      const right = Math.max(-1, Math.min(1, this.lastRight)) * 0.18;
      buffer.writeInt16LE(Math.round(left * 32767), index * 4);
      buffer.writeInt16LE(Math.round(right * 32767), (index * 4) + 2);
    }
    this.push(buffer);
  }
}

function stop(guildId) {
  const session = sessions.get(guildId);
  if (!session) return false;
  session.player.stop(true);
  session.noise.destroy();
  session.connection.destroy();
  sessions.delete(guildId);
  return true;
}

async function join(interaction) {
  const voice = interaction.member?.voice?.channel;
  if (!voice) throw new UserError('Join a voice channel first, then run this again.');
  const permissions = voice.permissionsFor(interaction.guild.members.me);
  if (!permissions?.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
    throw new UserError('I need Connect and Speak in that voice channel.');
  }

  let voiceLib;
  let prism;
  try {
    voiceLib = require('@discordjs/voice');
    prism = require('prism-media');
  } catch {
    throw new UserError('Ambient audio is not installed. From the bot folder, run `npm install` and restart.');
  }

  stop(interaction.guildId);
  const noise = new NoiseStream();
  let encoder;
  try {
    encoder = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });
  } catch {
    noise.destroy();
    throw new UserError('Ambient audio needs an Opus encoder. Install dependencies with `npm install` and restart.');
  }

  const connection = voiceLib.joinVoiceChannel({
    channelId: voice.id,
    guildId: interaction.guildId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  const player = voiceLib.createAudioPlayer();
  const resource = voiceLib.createAudioResource(noise.pipe(encoder), {
    inputType: voiceLib.StreamType.Opus,
  });
  connection.subscribe(player);
  player.play(resource);
  player.on('error', (error) => console.error('Ambient player error', error));
  sessions.set(interaction.guildId, { connection, player, noise });
  await interaction.reply(ephemeral(`Quiet noise is playing in ${voice}. \`/ambient leave\` stops it.`));
}

async function leave(interaction) {
  const stopped = stop(interaction.guildId);
  await interaction.reply(ephemeral(stopped ? 'Left the voice channel.' : 'I was not playing anything.'));
}

module.exports = { join, leave, stop };
