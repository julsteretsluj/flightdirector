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

module.exports = { rolePresets: { neurotypes } };
