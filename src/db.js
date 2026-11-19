'use strict';

const fs = require('fs');
const path = require('path');

const { Database } = require('node-sqlite3-wasm');

function statement(raw, sql) {
  return {
    get(...params) {
      const stmt = raw.prepare(sql);
      try {
        const row = params.length ? stmt.get(params) : stmt.get();
        return row == null ? undefined : row;
      } finally {
        stmt.finalize();
      }
    },
    all(...params) {
      const stmt = raw.prepare(sql);
      try {
        return params.length ? stmt.all(params) : stmt.all();
      } finally {
        stmt.finalize();
      }
    },
    run(...params) {
      const stmt = raw.prepare(sql);
      try {
        const result = params.length ? stmt.run(params) : stmt.run();
        return {
          changes: Number(result?.changes || 0),
          lastInsertRowid: Number(result?.lastInsertRowid || 0),
        };
      } finally {
        stmt.finalize();
      }
    },
  };
}

const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dir, { recursive: true });

const file = path.join(dir, '0gbot.sqlite');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function clearStaleLocks(dbFile) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(`${dbFile}${suffix}.lock`, { recursive: true, force: true });
  }
}

function openDatabase(dbFile) {
  let last;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    clearStaleLocks(dbFile);
    let opened;
    try {
      opened = new Database(dbFile);
      opened.exec('PRAGMA busy_timeout = 3000;');
      opened.exec('PRAGMA journal_mode = DELETE;');
      opened.exec('PRAGMA foreign_keys = ON;');
      return opened;
    } catch (error) {
      last = error;
      if (opened) {
        try { opened.close(); } catch { /* the handle may already be closed */ }
      }
      if (!/locked|busy/i.test(String(error && error.message)) || attempt === 4) throw error;
      sleep(400);
    }
  }
  throw last;
}

const raw = openDatabase(file);
const db = {
  exec(sql) {
    raw.exec(sql);
  },
  prepare(sql) {
    return statement(raw, sql);
  },
};

db.exec(`
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  confession_channel_id TEXT,
  confession_log_channel_id TEXT,
  confession_review INTEGER NOT NULL DEFAULT 0,
  confession_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS embeds (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name)
);

CREATE TABLE IF NOT EXISTS rr_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT,
  color INTEGER,
  mode TEXT NOT NULL DEFAULT 'button',
  exclusive INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rr_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_id INTEGER NOT NULL REFERENCES rr_panels(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  emoji TEXT,
  label TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'Secondary',
  UNIQUE (panel_id, role_id)
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT UNIQUE,
  question TEXT NOT NULL,
  multi INTEGER NOT NULL DEFAULT 0,
  anonymous INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER,
  closed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (poll_id, option_id, user_id)
);

CREATE TABLE IF NOT EXISTS confessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  thread_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  UNIQUE (guild_id, number)
);

CREATE TABLE IF NOT EXISTS confession_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  confession_id INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  pronouns TEXT,
  tagline TEXT,
  bio TEXT,
  location TEXT,
  accent INTEGER NOT NULL DEFAULT 1907999,
  banner_url TEXT,
  links TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_polls_due ON polls (closed, ends_at);
CREATE INDEX IF NOT EXISTS idx_rr_options_panel ON rr_options (panel_id);
CREATE INDEX IF NOT EXISTS idx_confessions_lookup ON confessions (guild_id, number);

CREATE TABLE IF NOT EXISTS systems (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  name TEXT,
  tag TEXT,
  avatar_url TEXT,
  autoproxy TEXT NOT NULL DEFAULT 'off',
  latch_member_id INTEGER,
  PRIMARY KEY (user_id, guild_id)
);

CREATE TABLE IF NOT EXISTS headmates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  avatar_url TEXT,
  pronouns TEXT,
  bio TEXT,
  tag_prefix TEXT,
  tag_suffix TEXT,
  UNIQUE (user_id, guild_id, name)
);

CREATE TABLE IF NOT EXISTS fronts (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, guild_id, member_id)
);

CREATE TABLE IF NOT EXISTS proxy_webhooks (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  webhook_token TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  host_id TEXT NOT NULL,
  work_ms INTEGER NOT NULL,
  break_ms INTEGER NOT NULL,
  phase TEXT NOT NULL,
  phase_ends_at INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  closed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS focus_members (
  session_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  intention TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  user_id TEXT NOT NULL,
  intention TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mod_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_headmates_owner ON headmates (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_focus_open ON focus_sessions (channel_id, closed);
CREATE INDEX IF NOT EXISTS idx_cases_target ON mod_cases (guild_id, target_id);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS economy_settings (
  guild_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS balances (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS shop_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  price INTEGER NOT NULL,
  stock INTEGER,
  description TEXT,
  role_id TEXT,
  require_role_id TEXT,
  remove_role_id TEXT,
  reply TEXT,
  giftable INTEGER NOT NULL DEFAULT 1,
  UNIQUE (guild_id, name)
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id INTEGER,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  role_id TEXT,
  remove_role_id TEXT,
  reply TEXT,
  giftable INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  ready_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, action)
);

CREATE TABLE IF NOT EXISTS reminders (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  ready_at INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, action)
);

CREATE TABLE IF NOT EXISTS drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  user_id TEXT,
  remaining INTEGER NOT NULL,
  code TEXT,
  once_only INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drop_claims (
  drop_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (drop_id, user_id)
);

CREATE TABLE IF NOT EXISTS pick_channels (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS currency_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  amount INTEGER NOT NULL,
  label TEXT,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_event
  ON currency_events (guild_id, channel_id) WHERE active = 1;

CREATE TABLE IF NOT EXISTS event_claims (
  event_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS autoresponders (
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL COLLATE NOCASE,
  reply TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'contains',
  PRIMARY KEY (guild_id, trigger)
);

CREATE TABLE IF NOT EXISTS companions (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  happiness INTEGER NOT NULL,
  lifetime_ms INTEGER NOT NULL,
  food INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  last_tick INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_owner ON inventory (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_shop_guild ON shop_items (guild_id);
CREATE INDEX IF NOT EXISTS idx_drops_channel ON drops (guild_id, channel_id, closed);
`);

for (const [name, type] of [
  ['log_channel_id', 'TEXT'],
  ['ticket_category_id', 'TEXT'],
  ['staff_role_id', 'TEXT'],
  ['automod_invites', 'INTEGER NOT NULL DEFAULT 1'],
  ['automod_spam', 'INTEGER NOT NULL DEFAULT 1'],
  ['raid_limit', 'INTEGER NOT NULL DEFAULT 8'],
  ['auto_lockdown', 'INTEGER NOT NULL DEFAULT 0'],
  ['lockdown', 'INTEGER NOT NULL DEFAULT 0'],
  ['lockdown_channels', 'TEXT'],
  ['verify_role_id', 'TEXT'],
  ['verify_hold_role_id', 'TEXT'],
  ['verify_phrase', 'TEXT'],
  ['verify_min_hours', 'INTEGER NOT NULL DEFAULT 0'],
  ['verify_message', 'TEXT'],
]) {
  try {
    db.exec(`ALTER TABLE guild_settings ADD COLUMN ${name} ${type}`);
  } catch (error) {
    if (!String(error.message).includes('duplicate column')) throw error;
  }
}

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* already closed */ }
    throw error;
  }
}

function blankSettings(guildId) {
  return {
    guild_id: guildId,
    confession_channel_id: null,
    confession_log_channel_id: null,
    confession_review: 0,
    confession_count: 0,
    log_channel_id: null,
    ticket_category_id: null,
    staff_role_id: null,
    automod_invites: 1,
    automod_spam: 1,
    raid_limit: 8,
    auto_lockdown: 0,
    lockdown: 0,
    lockdown_channels: '[]',
    verify_role_id: null,
    verify_hold_role_id: null,
    verify_phrase: null,
    verify_min_hours: 0,
    verify_message: null,
  };
}

function getSettings(guildId) {
  return db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId) || blankSettings(guildId);
}

function saveSettings(guildId, patch) {
  const next = { ...blankSettings(guildId), ...getSettings(guildId), ...patch, guild_id: guildId };
  db.prepare(`
    INSERT INTO guild_settings (
      guild_id, confession_channel_id, confession_log_channel_id, confession_review, confession_count,
      log_channel_id, ticket_category_id, staff_role_id, automod_invites, automod_spam,
      raid_limit, auto_lockdown, lockdown, lockdown_channels,
      verify_role_id, verify_hold_role_id, verify_phrase, verify_min_hours, verify_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      confession_channel_id = excluded.confession_channel_id,
      confession_log_channel_id = excluded.confession_log_channel_id,
      confession_review = excluded.confession_review,
      confession_count = excluded.confession_count,
      log_channel_id = excluded.log_channel_id,
      ticket_category_id = excluded.ticket_category_id,
      staff_role_id = excluded.staff_role_id,
      automod_invites = excluded.automod_invites,
      automod_spam = excluded.automod_spam,
      raid_limit = excluded.raid_limit,
      auto_lockdown = excluded.auto_lockdown,
      lockdown = excluded.lockdown,
      lockdown_channels = excluded.lockdown_channels,
      verify_role_id = excluded.verify_role_id,
      verify_hold_role_id = excluded.verify_hold_role_id,
      verify_phrase = excluded.verify_phrase,
      verify_min_hours = excluded.verify_min_hours,
      verify_message = excluded.verify_message
  `).run(
    next.guild_id,
    next.confession_channel_id,
    next.confession_log_channel_id,
    next.confession_review ? 1 : 0,
    next.confession_count || 0,
    next.log_channel_id,
    next.ticket_category_id,
    next.staff_role_id,
    next.automod_invites ? 1 : 0,
    next.automod_spam ? 1 : 0,
    next.raid_limit ?? 8,
    next.auto_lockdown ? 1 : 0,
    next.lockdown ? 1 : 0,
    next.lockdown_channels || '[]',
    next.verify_role_id,
    next.verify_hold_role_id,
    next.verify_phrase,
    next.verify_min_hours || 0,
    next.verify_message,
  );
  return getSettings(guildId);
}

function getEmbed(guildId, name) {
  const row = db.prepare('SELECT * FROM embeds WHERE guild_id = ? AND name = ?').get(guildId, name);
  if (!row) return null;
  return { ...row, payload: JSON.parse(row.payload) };
}

function embedNames(guildId) {
  return db.prepare('SELECT name FROM embeds WHERE guild_id = ? ORDER BY name').all(guildId).map((row) => row.name);
}

function createEmbed(guildId, name, payload, createdBy) {
  db.prepare(`
    INSERT INTO embeds (guild_id, name, payload, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, name, JSON.stringify(payload), createdBy, Date.now());
  return getEmbed(guildId, name);
}

function saveEmbedPayload(guildId, name, payload) {
  db.prepare('UPDATE embeds SET payload = ?, updated_at = ? WHERE guild_id = ? AND name = ?')
    .run(JSON.stringify(payload), Date.now(), guildId, name);
  return getEmbed(guildId, name);
}

function deleteEmbed(guildId, name) {
  return db.prepare('DELETE FROM embeds WHERE guild_id = ? AND name = ?').run(guildId, name).changes;
}

function createPanel(panel) {
  const result = db.prepare(`
    INSERT INTO rr_panels (guild_id, channel_id, message_id, title, description, color, mode, exclusive)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    panel.guild_id,
    panel.channel_id,
    panel.message_id,
    panel.title,
    panel.description,
    panel.color,
    panel.mode,
    panel.exclusive ? 1 : 0,
  );
  return getPanel(Number(result.lastInsertRowid));
}

function getPanel(id) {
  return db.prepare('SELECT * FROM rr_panels WHERE id = ?').get(id) || null;
}

function getPanelByMessage(messageId) {
  return db.prepare('SELECT * FROM rr_panels WHERE message_id = ?').get(messageId) || null;
}

function listPanels(guildId) {
  return db.prepare('SELECT * FROM rr_panels WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}

function deletePanel(id) {
  db.prepare('DELETE FROM rr_panels WHERE id = ?').run(id);
}

function panelOptions(panelId) {
  return db.prepare('SELECT * FROM rr_options WHERE panel_id = ? ORDER BY id').all(panelId);
}

function getPanelOption(id) {
  return db.prepare('SELECT * FROM rr_options WHERE id = ?').get(id) || null;
}

function addPanelOption(option) {
  const result = db.prepare(`
    INSERT INTO rr_options (panel_id, role_id, emoji, label, style)
    VALUES (?, ?, ?, ?, ?)
  `).run(option.panel_id, option.role_id, option.emoji, option.label, option.style);
  return db.prepare('SELECT * FROM rr_options WHERE id = ?').get(Number(result.lastInsertRowid));
}

function deletePanelOption(panelId, roleId) {
  return db.prepare('DELETE FROM rr_options WHERE panel_id = ? AND role_id = ?').run(panelId, roleId).changes;
}

function createPoll({ guildId, channelId, question, multi, anonymous, endsAt, createdBy, labels }) {
  return transaction(() => {
    const result = db.prepare(`
      INSERT INTO polls (guild_id, channel_id, question, multi, anonymous, ends_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, channelId, question, multi ? 1 : 0, anonymous ? 1 : 0, endsAt, createdBy);
    const pollId = Number(result.lastInsertRowid);
    const insert = db.prepare('INSERT INTO poll_options (poll_id, label, position) VALUES (?, ?, ?)');
    labels.forEach((label, index) => insert.run(pollId, label, index));
    return getPoll(pollId);
  });
}

function setPollMessage(pollId, messageId) {
  db.prepare('UPDATE polls SET message_id = ? WHERE id = ?').run(messageId, pollId);
}

function getPoll(id) {
  return db.prepare('SELECT * FROM polls WHERE id = ?').get(id) || null;
}

function getPollByMessage(messageId) {
  return db.prepare('SELECT * FROM polls WHERE message_id = ?').get(messageId) || null;
}

function deletePoll(id) {
  db.prepare('DELETE FROM polls WHERE id = ?').run(id);
}

function closePollRecord(id) {
  db.prepare('UPDATE polls SET closed = 1 WHERE id = ?').run(id);
}

function duePolls(now) {
  return db.prepare('SELECT * FROM polls WHERE closed = 0 AND ends_at IS NOT NULL AND ends_at <= ?').all(now);
}

function pollTally(pollId) {
  return db.prepare(`
    SELECT o.id, o.label, o.position, COUNT(v.user_id) AS votes
    FROM poll_options o
    LEFT JOIN poll_votes v ON v.option_id = o.id
    WHERE o.poll_id = ?
    GROUP BY o.id
    ORDER BY o.position
  `).all(pollId);
}

function pollVoters(optionId) {
  return db.prepare('SELECT user_id FROM poll_votes WHERE option_id = ? ORDER BY user_id').all(optionId)
    .map((row) => row.user_id);
}

function castVote(poll, optionId, userId) {
  return transaction(() => {
    const existing = db.prepare(
      'SELECT 1 AS ok FROM poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?',
    ).get(poll.id, optionId, userId);
    if (existing) {
      db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?')
        .run(poll.id, optionId, userId);
      return 'removed';
    }
    if (!poll.multi) {
      db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(poll.id, userId);
    }
    db.prepare('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)').run(poll.id, optionId, userId);
    return 'added';
  });
}

function allocateConfession(guildId, authorId, content) {
  return transaction(() => {
    const settings = getSettings(guildId);
    const number = (settings.confession_count || 0) + 1;
    saveSettings(guildId, { confession_count: number });
    const result = db.prepare(`
      INSERT INTO confessions (guild_id, number, author_id, content, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(guildId, number, authorId, content, Date.now());
    return getConfession(Number(result.lastInsertRowid));
  });
}

function getConfession(id) {
  return db.prepare('SELECT * FROM confessions WHERE id = ?').get(id) || null;
}

function claimPendingConfession(id) {
  return transaction(() => {
    const current = getConfession(id);
    if (!current || current.status !== 'pending') return null;
    db.prepare(`UPDATE confessions SET status = 'posting' WHERE id = ?`).run(id);
    return getConfession(id);
  });
}

function markConfession(id, patch) {
  const current = getConfession(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db.prepare(`
    UPDATE confessions
    SET status = ?, channel_id = ?, message_id = ?, thread_id = ?
    WHERE id = ?
  `).run(next.status, next.channel_id, next.message_id, next.thread_id, id);
  return getConfession(id);
}

function addConfessionReply(confessionId, authorId, content) {
  db.prepare(`
    INSERT INTO confession_replies (confession_id, author_id, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(confessionId, authorId, content, Date.now());
}

function getProfile(userId) {
  const row = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!row) return null;
  return { ...row, links: JSON.parse(row.links || '[]') };
}

function saveProfile(userId, patch) {
  const current = getProfile(userId) || {
    display_name: null,
    pronouns: null,
    tagline: null,
    bio: null,
    location: null,
    accent: 0x1d1d1f,
    banner_url: null,
    links: [],
  };
  const next = { ...current, ...patch };
  const links = JSON.stringify(next.links || []);
  db.prepare(`
    INSERT INTO profiles (
      user_id, display_name, pronouns, tagline, bio, location, accent, banner_url, links, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      pronouns = excluded.pronouns,
      tagline = excluded.tagline,
      bio = excluded.bio,
      location = excluded.location,
      accent = excluded.accent,
      banner_url = excluded.banner_url,
      links = excluded.links,
      updated_at = excluded.updated_at
  `).run(
    userId,
    next.display_name,
    next.pronouns,
    next.tagline,
    next.bio,
    next.location,
    next.accent ?? 0x1d1d1f,
    next.banner_url,
    links,
    Date.now(),
  );
  return getProfile(userId);
}

function deleteProfile(userId) {
  return db.prepare('DELETE FROM profiles WHERE user_id = ?').run(userId).changes;
}

module.exports = {
  db,
  transaction,
  getSettings,
  saveSettings,
  getEmbed,
  embedNames,
  createEmbed,
  saveEmbedPayload,
  deleteEmbed,
  createPanel,
  getPanel,
  getPanelByMessage,
  listPanels,
  deletePanel,
  panelOptions,
  getPanelOption,
  addPanelOption,
  deletePanelOption,
  createPoll,
  setPollMessage,
  getPoll,
  getPollByMessage,
  deletePoll,
  closePollRecord,
  duePolls,
  pollTally,
  pollVoters,
  castVote,
  allocateConfession,
  getConfession,
  claimPendingConfession,
  markConfession,
  addConfessionReply,
  getProfile,
  saveProfile,
  deleteProfile,
};
