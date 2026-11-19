'use strict';

const { db, transaction } = require('./db');

function getSystem(guildId, userId) {
  return db.prepare('SELECT * FROM systems WHERE guild_id = ? AND user_id = ?').get(guildId, userId) || null;
}

function saveSystem(guildId, userId, patch) {
  const current = getSystem(guildId, userId) || {
    name: null,
    tag: null,
    avatar_url: null,
    autoproxy: 'off',
    latch_member_id: null,
  };
  const next = { ...current, ...patch };
  db.prepare(`
    INSERT INTO systems (user_id, guild_id, name, tag, avatar_url, autoproxy, latch_member_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      name = excluded.name,
      tag = excluded.tag,
      avatar_url = excluded.avatar_url,
      autoproxy = excluded.autoproxy,
      latch_member_id = excluded.latch_member_id
  `).run(userId, guildId, next.name, next.tag, next.avatar_url, next.autoproxy || 'off', next.latch_member_id);
  return getSystem(guildId, userId);
}

function deleteSystem(guildId, userId) {
  db.prepare('DELETE FROM fronts WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  db.prepare('DELETE FROM headmates WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  return db.prepare('DELETE FROM systems WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes;
}

function listHeadmates(guildId, userId) {
  return db.prepare('SELECT * FROM headmates WHERE guild_id = ? AND user_id = ? ORDER BY name COLLATE NOCASE')
    .all(guildId, userId);
}

function findHeadmate(guildId, userId, name) {
  return db.prepare(`
    SELECT * FROM headmates
    WHERE guild_id = ? AND user_id = ? AND name = ? COLLATE NOCASE
  `).get(guildId, userId, name) || null;
}

function getHeadmate(id) {
  return db.prepare('SELECT * FROM headmates WHERE id = ?').get(id) || null;
}

function addHeadmate(member) {
  const result = db.prepare(`
    INSERT INTO headmates (user_id, guild_id, name, avatar_url, pronouns, bio, tag_prefix, tag_suffix)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    member.user_id,
    member.guild_id,
    member.name,
    member.avatar_url,
    member.pronouns,
    member.bio,
    member.tag_prefix,
    member.tag_suffix,
  );
  return getHeadmate(Number(result.lastInsertRowid));
}

function updateHeadmate(id, patch) {
  const current = getHeadmate(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db.prepare(`
    UPDATE headmates
    SET name = ?, avatar_url = ?, pronouns = ?, bio = ?, tag_prefix = ?, tag_suffix = ?
    WHERE id = ?
  `).run(next.name, next.avatar_url, next.pronouns, next.bio, next.tag_prefix, next.tag_suffix, id);
  return getHeadmate(id);
}

function deleteHeadmate(id) {
  db.prepare('DELETE FROM fronts WHERE member_id = ?').run(id);
  db.prepare('UPDATE systems SET latch_member_id = NULL WHERE latch_member_id = ?').run(id);
  return db.prepare('DELETE FROM headmates WHERE id = ?').run(id).changes;
}

function listFronts(guildId, userId) {
  return db.prepare(`
    SELECT h.* FROM fronts f
    JOIN headmates h ON h.id = f.member_id
    WHERE f.guild_id = ? AND f.user_id = ?
    ORDER BY f.started_at
  `).all(guildId, userId);
}

function setFront(guildId, userId, memberId, { add = false } = {}) {
  transaction(() => {
    if (!add) db.prepare('DELETE FROM fronts WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    db.prepare(`
      INSERT INTO fronts (user_id, guild_id, member_id, started_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, guild_id, member_id) DO UPDATE SET started_at = excluded.started_at
    `).run(userId, guildId, memberId, Date.now());
  });
  return listFronts(guildId, userId);
}

function clearFront(guildId, userId, memberId = null) {
  if (memberId) {
    db.prepare('DELETE FROM fronts WHERE guild_id = ? AND user_id = ? AND member_id = ?').run(guildId, userId, memberId);
  } else {
    db.prepare('DELETE FROM fronts WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }
  return listFronts(guildId, userId);
}

function getWebhook(channelId) {
  return db.prepare('SELECT * FROM proxy_webhooks WHERE channel_id = ?').get(channelId) || null;
}

function saveWebhook(channelId, guildId, webhookId, token) {
  db.prepare(`
    INSERT INTO proxy_webhooks (channel_id, guild_id, webhook_id, webhook_token)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      webhook_id = excluded.webhook_id,
      webhook_token = excluded.webhook_token
  `).run(channelId, guildId, webhookId, token);
}

function deleteWebhook(channelId) {
  db.prepare('DELETE FROM proxy_webhooks WHERE channel_id = ?').run(channelId);
}

function openFocus(channelId) {
  return db.prepare('SELECT * FROM focus_sessions WHERE channel_id = ? AND closed = 0').get(channelId) || null;
}

function listOpenFocus() {
  return db.prepare('SELECT * FROM focus_sessions WHERE closed = 0').all();
}

function createFocus(session) {
  const result = db.prepare(`
    INSERT INTO focus_sessions (
      guild_id, channel_id, host_id, work_ms, break_ms, phase, phase_ends_at, round
    ) VALUES (?, ?, ?, ?, ?, 'work', ?, 1)
  `).run(session.guildId, session.channelId, session.hostId, session.workMs, session.breakMs, Date.now() + session.workMs);
  const id = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO focus_members (session_id, user_id, intention, done) VALUES (?, ?, ?, 0)')
    .run(id, session.hostId, session.intention || null);
  return getFocus(id);
}

function getFocus(id) {
  return db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id) || null;
}

function setFocusMessage(id, messageId) {
  db.prepare('UPDATE focus_sessions SET message_id = ? WHERE id = ?').run(messageId, id);
}

function saveFocusPhase(id, phase, endsAt, round) {
  db.prepare('UPDATE focus_sessions SET phase = ?, phase_ends_at = ?, round = ? WHERE id = ?')
    .run(phase, endsAt, round, id);
}

function closeFocus(id) {
  db.prepare('UPDATE focus_sessions SET closed = 1 WHERE id = ?').run(id);
}

function focusMembers(sessionId) {
  return db.prepare('SELECT * FROM focus_members WHERE session_id = ? ORDER BY user_id').all(sessionId);
}

function joinFocus(sessionId, userId) {
  db.prepare(`
    INSERT INTO focus_members (session_id, user_id, intention, done)
    VALUES (?, ?, NULL, 0)
    ON CONFLICT(session_id, user_id) DO NOTHING
  `).run(sessionId, userId);
}

function leaveFocus(sessionId, userId) {
  db.prepare('DELETE FROM focus_members WHERE session_id = ? AND user_id = ?').run(sessionId, userId);
}

function setIntention(sessionId, userId, intention) {
  joinFocus(sessionId, userId);
  db.prepare('UPDATE focus_members SET intention = ?, done = 0 WHERE session_id = ? AND user_id = ?')
    .run(intention, sessionId, userId);
}

function finishIntention(sessionId, userId) {
  db.prepare('UPDATE focus_members SET done = 1 WHERE session_id = ? AND user_id = ?').run(sessionId, userId);
}

function createCheckin({ guildId, channelId, userId, intention }) {
  const result = db.prepare(`
    INSERT INTO checkins (guild_id, channel_id, user_id, intention, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, channelId, userId, intention, Date.now());
  return getCheckin(Number(result.lastInsertRowid));
}

function getCheckin(id) {
  return db.prepare('SELECT * FROM checkins WHERE id = ?').get(id) || null;
}

function setCheckinMessage(id, messageId) {
  db.prepare('UPDATE checkins SET message_id = ? WHERE id = ?').run(messageId, id);
}

function completeCheckin(id) {
  db.prepare('UPDATE checkins SET done = 1 WHERE id = ?').run(id);
  return getCheckin(id);
}

function openCheckins(guildId, userId) {
  return db.prepare(`
    SELECT * FROM checkins
    WHERE guild_id = ? AND user_id = ? AND done = 0
    ORDER BY id DESC LIMIT 10
  `).all(guildId, userId);
}

function createTicket({ guildId, channelId, ownerId, subject }) {
  const result = db.prepare(`
    INSERT INTO tickets (guild_id, channel_id, owner_id, subject, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, channelId, ownerId, subject, Date.now());
  return getTicket(Number(result.lastInsertRowid));
}

function getTicket(id) {
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) || null;
}

function getTicketByChannel(channelId) {
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId) || null;
}

function openTicketFor(guildId, ownerId) {
  return db.prepare(`
    SELECT * FROM tickets
    WHERE guild_id = ? AND owner_id = ? AND status = 'open'
    ORDER BY id DESC
  `).get(guildId, ownerId) || null;
}

function closeTicket(id) {
  db.prepare(`UPDATE tickets SET status = 'closed' WHERE id = ?`).run(id);
}

function nextCase(guildId, action, targetId, moderatorId, reason) {
  return transaction(() => {
    const count = (db.prepare('SELECT COUNT(*) AS n FROM mod_cases WHERE guild_id = ?').get(guildId).n || 0) + 1;
    const result = db.prepare(`
      INSERT INTO mod_cases (guild_id, number, action, target_id, moderator_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, count, action, targetId, moderatorId, reason, Date.now());
    return db.prepare('SELECT * FROM mod_cases WHERE id = ?').get(Number(result.lastInsertRowid));
  });
}

function casesFor(guildId, targetId) {
  return db.prepare(`
    SELECT * FROM mod_cases
    WHERE guild_id = ? AND target_id = ?
    ORDER BY number DESC LIMIT 15
  `).all(guildId, targetId);
}

module.exports = {
  getSystem,
  saveSystem,
  deleteSystem,
  listHeadmates,
  findHeadmate,
  getHeadmate,
  addHeadmate,
  updateHeadmate,
  deleteHeadmate,
  listFronts,
  setFront,
  clearFront,
  getWebhook,
  saveWebhook,
  deleteWebhook,
  openFocus,
  listOpenFocus,
  createFocus,
  getFocus,
  setFocusMessage,
  saveFocusPhase,
  closeFocus,
  focusMembers,
  joinFocus,
  leaveFocus,
  setIntention,
  finishIntention,
  createCheckin,
  getCheckin,
  setCheckinMessage,
  completeCheckin,
  openCheckins,
  createTicket,
  getTicket,
  getTicketByChannel,
  openTicketFor,
  closeTicket,
  nextCase,
  casesFor,
};
