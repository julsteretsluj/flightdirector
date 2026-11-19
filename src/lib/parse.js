'use strict';

const INK = 0x1d1d1f;
const ACCENT = 0x007aff;
const QUIET = 0x636366;

function parseColor(input) {
  if (input == null) return undefined;
  const raw = String(input).trim();
  if (!raw) return undefined;
  if (raw === '-' || raw.toLowerCase() === 'none') return null;
  const hex = raw.replace(/^#/, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { error: 'Use a hex color like `#007AFF`, or `none` to clear it.' };
  }
  return parseInt(hex, 16);
}

function parseDuration(input) {
  if (input == null || !String(input).trim()) return undefined;
  const match = String(input).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return { error: 'Use a duration like `30s`, `10m`, `2h`, or `1d`.' };
  const amount = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
  const ms = amount * unit;
  if (ms < 30_000 || ms > 7 * 86_400_000) {
    return { error: 'Polls can stay open from 30 seconds up to 7 days.' };
  }
  return ms;
}

function parseTimeout(input) {
  if (input == null || !String(input).trim()) return { error: 'Use a length like `10m`, `1h`, `1d`, or `7d`.' };
  const match = String(input).trim().match(/^(\d+)\s*(m|h|d)$/i);
  if (!match) return { error: 'Use a length like `10m`, `1h`, `1d`, or `7d`.' };
  const amount = Number(match[1]);
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
  const ms = amount * unit;
  if (ms < 60_000 || ms > 28 * 86_400_000) {
    return { error: 'Timeouts can last from 1 minute up to 28 days.' };
  }
  return ms;
}

function parseMessageRef(input) {
  const text = String(input || '').trim();
  const link = text.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (link) return { guildId: link[1], channelId: link[2], messageId: link[3] };
  if (/^\d{17,20}$/.test(text)) return { messageId: text };
  return null;
}

function parseHttpUrl(input, { allowClear = false } = {}) {
  if (input == null) return undefined;
  const text = String(input).trim();
  if (!text) return undefined;
  if (allowClear && (text === '-' || text.toLowerCase() === 'none')) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'That URL needs to start with http:// or https://.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'That URL needs to start with http:// or https://.' };
  }
  if (url.toString().length > 512) return { error: 'That URL is too long.' };
  return url.toString();
}

function embedName(input) {
  const name = String(input || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-_]{0,31}$/.test(name)) return null;
  return name;
}

function splitPollOptions(input) {
  const parts = String(input || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 10) {
    return { error: 'Give between 2 and 10 choices, separated by `|`.' };
  }
  if (parts.some((part) => part.length > 80)) {
    return { error: 'Each choice needs to be 80 characters or fewer.' };
  }
  const seen = new Set();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) return { error: `“${part}” is listed twice.` };
    seen.add(key);
  }
  return parts;
}

function neutralizePings(text) {
  return String(text || '').replace(/@(everyone|here)/gi, '@\u200b$1');
}

function clearedText(incoming, current) {
  if (incoming == null) return current ?? null;
  const value = String(incoming).trim();
  if (!value) return current ?? null;
  if (value === '-' || value.toLowerCase() === 'none') return null;
  return value;
}

function bar(count, total, width = 12) {
  const filled = total === 0 ? 0 : Math.round((count / total) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function chunk(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

module.exports = {
  INK,
  ACCENT,
  QUIET,
  parseColor,
  parseDuration,
  parseTimeout,
  parseMessageRef,
  parseHttpUrl,
  embedName,
  splitPollOptions,
  neutralizePings,
  clearedText,
  bar,
  chunk,
};
