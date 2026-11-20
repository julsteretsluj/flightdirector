'use strict';

const NIGHT = 0x5e7c99;

const neurotypes = {
  title: '🧠 neurotypes & orbit identity',
  description: 'self-id, formal diagnosis, questioning, and allies are all welcome. pick whatever fits you today, or none at all.',
  color: NIGHT,
  roles: [
    { emoji: '♾️', name: '♾️・autistic' },
    { emoji: '⚡', name: '⚡・adhd' },
    { emoji: '🌀', name: '🌀・audhd' },
    { emoji: '🔤', name: '🔤・dyslexic' },
    { emoji: '🔢', name: '🔢・dyscalculic' },
    { emoji: '🧭', name: '🧭・dyspraxic' },
    { emoji: '✍️', name: '✍️・dysgraphic' },
    { emoji: '✨', name: '✨・tourette\'s / tics' },
    { emoji: '🔁', name: '🔁・ocd' },
    { emoji: '🌗', name: '🌗・bipolar' },
    { emoji: '🎧', name: '🎧・sensory processing' },
    { emoji: '🔇', name: '🔇・auditory processing' },
    { emoji: '🪐', name: '🪐・system / plural' },
    { emoji: '🔭', name: '🔭・questioning / exploring' },
    { emoji: '🌌', name: '🌌・other nd' },
    { emoji: '🤝', name: '🤝・ally / supporter' },
  ],
};

const pronouns = {
  title: '🗣️ pronouns',
  description: 'react with any pronouns that feel right. you can pick multiple or change them whenever you want.',
  color: NIGHT,
  roles: [
    { emoji: '🩷', name: 'she/her' },
    { emoji: '🩵', name: 'he/him' },
    { emoji: '💜', name: 'they/them' },
    { emoji: '💎', name: 'it/its' },
    { emoji: '⭐', name: 'xe/xem' },
    { emoji: '🌿', name: 'ze/zir' },
    { emoji: '🧡', name: 'any pronouns' },
    { emoji: '🤍', name: 'ask for pronouns' },
    { emoji: '🌙', name: 'pronouns in bio' },
  ],
};

const boundaries = {
  title: '📡 comms & boundaries',
  description: 'let the crew know how you prefer to communicate and whether dms are open.',
  color: NIGHT,
  roles: [
    { emoji: '📡', name: '📡・dms open' },
    { emoji: '📶', name: '📶・ask before dming' },
    { emoji: '📵', name: '📵・dms closed' },
    { emoji: '🏷️', name: '🏷️・tone tags appreciated' },
    { emoji: '🎯', name: '🎯・direct & literal' },
    { emoji: '🪫', name: '🪫・slow replies' },
  ],
};

module.exports = { rolePresets: { neurotypes, pronouns, boundaries } };
