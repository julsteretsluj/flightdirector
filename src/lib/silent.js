'use strict';

const pending = new Set();

function markSilent(id) {
  pending.add(id);
  const timer = setTimeout(() => pending.delete(id), 20_000);
  timer.unref?.();
}

function isSilent(id) {
  return pending.has(id);
}

module.exports = { markSilent, isSilent };
