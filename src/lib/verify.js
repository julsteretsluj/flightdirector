'use strict';

function phraseMatches(expected, given) {
  if (!expected) return true;
  return String(given || '').trim().toLowerCase() === String(expected).trim().toLowerCase();
}

function accountTooNew(createdAt, minHours, now) {
  const hours = Number(minHours) || 0;
  if (hours <= 0) return false;
  return now - createdAt < hours * 60 * 60 * 1000;
}

module.exports = { phraseMatches, accountTooNew };
