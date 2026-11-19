'use strict';

const CAP = 1_000_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_LIFE = 30 * DAY;

const SPAWN_MS = {
  veryfast: 5 * 60 * 1000,
  fast: 15 * 60 * 1000,
  medium: 30 * 60 * 1000,
  slow: 60 * 60 * 1000,
  veryslow: 2 * 60 * 60 * 1000,
};

function money(amount) {
  const n = Math.floor(Number(amount));
  if (!Number.isSafeInteger(n) || n < 0 || n > CAP) return null;
  return n;
}

function formatMoney(amount, symbol) {
  return `${Number(amount).toLocaleString('en-US')} ${symbol}`;
}

function itemName(raw) {
  const name = String(raw || '').replace(/[@#`\n]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 32) return null;
  return name;
}

function currencySymbol(raw) {
  const symbol = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!symbol || symbol.length > 32) return null;
  if (/@(everyone|here)/i.test(symbol)) return null;
  return symbol;
}

function petName(raw) {
  const name = String(raw || '').replace(/[@#`*_\n]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 24) return null;
  return name;
}

function quotePurchase(item, qty, balance) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) return { error: 'Buy between 1 and 100 at a time.' };
  if (item.stock != null && item.stock < qty) {
    return { error: item.stock < 1 ? 'That item is sold out.' : `Only ${item.stock} left.` };
  }
  const cost = item.price * qty;
  if (!Number.isSafeInteger(cost) || cost < 0 || cost > CAP) return { error: 'That total is too large.' };
  if (balance < cost) return { error: 'You do not have enough for that.' };
  return { cost };
}

function transferSplit(amount, taxPercent, balance) {
  const value = money(amount);
  if (value == null || value < 1) return { error: 'Enter an amount of at least 1.' };
  if (value > balance) return { error: 'You do not have that much.' };
  const tax = Math.floor((value * taxPercent) / 100);
  const received = value - tax;
  if (received < 1) return { error: 'Tax would leave nothing to give.' };
  return { amount: value, tax, received };
}

function tuneRange(currentMin, currentMax, min, max) {
  let lo = min == null ? currentMin : min;
  let hi = max == null ? currentMax : max;
  if (lo > hi) {
    if (min != null && max == null) hi = lo;
    else lo = hi;
  }
  return { min: lo, max: hi };
}

function pageOf(items, page, pageSize) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize) || 1);
  const current = Math.min(Math.max(page || 1, 1), pages);
  const start = (current - 1) * pageSize;
  return { pages, current, slice: items.slice(start, start + pageSize) };
}

function diceOutcome(roll) {
  if (roll === 100) return 10;
  if (roll > 90) return 4;
  if (roll > 64) return 2;
  return 0;
}

function slotPayout(reels) {
  const counts = new Map();
  for (const reel of reels) counts.set(reel, (counts.get(reel) || 0) + 1);
  const best = Math.max(...counts.values());
  if (best >= 3) return 5;
  if (best === 2) return 2;
  return 0;
}

function matchesTrigger(content, trigger, mode) {
  const hay = String(content || '').toLowerCase();
  const needle = String(trigger || '').toLowerCase();
  if (!needle) return false;
  if (mode === 'exact') return hay.trim() === needle.trim();
  if (mode === 'startswith') return hay.startsWith(needle);
  return hay.includes(needle);
}

function pickResponder(rows, content) {
  const rank = { exact: 3, startswith: 2, contains: 1 };
  const matches = rows.filter((row) => matchesTrigger(content, row.trigger, row.match_mode));
  matches.sort((a, b) => (rank[b.match_mode] || 0) - (rank[a.match_mode] || 0) || b.trigger.length - a.trigger.length);
  return matches[0] || null;
}

function formatLife(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(total / (60 * 24));
  const hours = Math.floor((total % (60 * 24)) / 60);
  const minutes = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function clampPet(pet) {
  return {
    ...pet,
    happiness: Math.max(0, Math.min(100, Math.round(pet.happiness))),
    lifetime_ms: Math.max(0, Math.min(MAX_LIFE, Math.round(pet.lifetime_ms))),
    food: Math.max(0, Math.min(999, Math.round(pet.food))),
    stars: Math.max(0, Math.min(9999, Math.round(pet.stars))),
  };
}

function tickCompanion(pet, now) {
  const elapsed = Math.max(0, now - pet.last_tick);
  return {
    ...pet,
    lifetime_ms: Math.max(0, pet.lifetime_ms - elapsed),
    last_tick: now,
  };
}

function newCompanion(guildId, userId, name, now) {
  return {
    guild_id: guildId,
    user_id: userId,
    name,
    happiness: 70,
    lifetime_ms: 7 * DAY,
    food: 3,
    stars: 0,
    last_tick: now,
  };
}

function applyActivity(kind, self, other, roll = 0) {
  const pet = { ...self };
  const pal = other ? { ...other } : null;
  const needsOther = ['playdate', 'visit', 'heal', 'stroll', 'dream', 'manifest'];
  if (needsOther.includes(kind) && !pal) return { error: 'Mention someone who has a companion.' };

  if (kind === 'play') {
    pet.happiness += 15;
    pet.lifetime_ms += 2 * HOUR;
  } else if (kind === 'feed') {
    if (pet.food < 1) return { error: 'You need pet food for that.' };
    if (pet.happiness < 40) return { error: 'They are too down to eat. Play with them first.' };
    pet.food -= 1;
    pet.lifetime_ms += 6 * HOUR;
  } else if (kind === 'playdate') {
    if (pet.food < 1 || pal.food < 1) return { error: 'Both of you need pet food for a playdate.' };
    if (pet.happiness < 50 || pal.happiness < 50) return { error: 'Both companions should be at least a little happy first.' };
    pet.food -= 1;
    pal.food -= 1;
    pet.happiness += 10;
    pal.happiness += 10;
    pet.lifetime_ms += 3 * HOUR;
    pal.lifetime_ms += 3 * HOUR;
  } else if (kind === 'breaktime') {
    if (pet.food < 1) return { error: 'You need pet food for a break.' };
    pet.food -= 1;
    pet.lifetime_ms += 3 * HOUR;
  } else if (kind === 'fetch') {
    pet.happiness += 8;
    pet.lifetime_ms += HOUR;
  } else if (kind === 'hike') {
    pet.happiness += 10;
    pet.lifetime_ms += 2 * HOUR;
  } else if (kind === 'swim') {
    pet.lifetime_ms += 3 * HOUR;
  } else if (kind === 'visit') {
    if (pet.happiness < 80) return { error: 'Your companion wants to feel happier before a visit.' };
    pal.happiness += 15;
  } else if (kind === 'heal') {
    if (pet.happiness < 80) return { error: 'Your companion wants to feel happier before healing someone.' };
    if (pet.lifetime_ms < 7 * DAY) return { error: 'Your companion needs more than a week of time left to share.' };
    pet.lifetime_ms -= 12 * HOUR;
    pal.lifetime_ms += 12 * HOUR;
  } else if (kind === 'stroll') {
    if (pet.food < 8) return { error: 'A stroll takes a stocked pantry. You need at least 8 food.' };
    pet.food -= 1;
    pet.lifetime_ms += 2 * HOUR;
    pal.lifetime_ms += 2 * HOUR;
    if (roll < 30) {
      pet.stars += 1;
      pal.stars += 1;
    }
  } else if (kind === 'sing') {
    pet.stars += 1;
  } else if (kind === 'draw') {
    pet.happiness += 12;
    pet.lifetime_ms += HOUR;
  } else if (kind === 'snooze') {
    if (pet.happiness < 30) return { error: 'They are too restless to nap.' };
    pet.happiness -= 10;
    pet.lifetime_ms += 4 * HOUR;
  } else if (kind === 'dream') {
    if (pet.food < 10) return { error: 'Dreaming together takes a stocked pantry. You need at least 10 food.' };
    pet.food -= 1;
    pet.stars += 1;
    pal.stars += 1;
  } else if (kind === 'explore') {
    pet.happiness -= 8;
    pet.food += 2;
  } else if (kind === 'manifest') {
    if (pet.stars < 2) return { error: 'Manifesting costs 2 stars.' };
    pet.stars -= 2;
    pet.happiness += 10;
    pal.happiness += 10;
    pet.lifetime_ms += 2 * HOUR;
    pal.lifetime_ms += 2 * HOUR;
  } else {
    return { error: 'That activity is not available.' };
  }

  return { self: clampPet(pet), other: pal ? clampPet(pal) : null };
}

function applyCozy(host, guests) {
  if (!guests.length) return { error: 'Invite at least one friend.' };
  if (host.food < 1) return { error: 'You need pet food to get cozy.' };
  if (host.happiness < 60) return { error: 'Your companion wants to be happier first.' };
  for (const guest of guests) {
    if (guest.happiness < 60) return { error: `${guest.name} is not up for getting cozy.` };
  }
  const bump = (pet, spendFood) => clampPet({
    ...pet,
    food: pet.food - (spendFood ? 1 : 0),
    happiness: pet.happiness + 8,
    lifetime_ms: pet.lifetime_ms + 2 * HOUR,
  });
  return { host: bump(host, true), guests: guests.map((guest) => bump(guest, false)) };
}

function rollBetween(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

module.exports = {
  CAP,
  HOUR,
  DAY,
  SPAWN_MS,
  money,
  formatMoney,
  itemName,
  currencySymbol,
  petName,
  quotePurchase,
  transferSplit,
  tuneRange,
  pageOf,
  diceOutcome,
  slotPayout,
  matchesTrigger,
  pickResponder,
  formatLife,
  tickCompanion,
  newCompanion,
  applyActivity,
  applyCozy,
  rollBetween,
  makeCode,
};
