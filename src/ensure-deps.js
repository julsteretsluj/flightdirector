'use strict';

const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const needed = [
  'discord.js',
  'dotenv',
  'node-sqlite3-wasm',
  '@discordjs/voice',
  'opusscript',
  'prism-media',
  'tweetnacl',
];

function missing(name) {
  try {
    require.resolve(name, { paths: [root] });
    return false;
  } catch {
    return true;
  }
}

if (needed.some(missing)) {
  execSync('npm install --omit=dev', { cwd: root, stdio: 'inherit' });
}
