'use strict';

const { db, transaction } = require('./db');
const { money, quotePurchase } = require('./lib/economy');

const DEFAULTS = {
  symbol: '🍪',
  start_amount: 0,
  save_on_leave: 1,
  pet_cooldown: 60 * 60 * 1000,
  pet_min: 10,
  pet_max: 25,
  snuggle_cooldown: 60 * 60 * 1000,
  snuggle_min: 15,
  snuggle_max: 40,
  cake_cooldown: 30 * 60 * 1000,
  cake_amount: 8,
  bet_min: 1,
  bet_max: 500,
  transfer_min: 1,
  transfer_max: 100000,
  transfer_tax: 0,
  pick_min: 5,
  pick_max: 40,
  pick_hard: 0,
  pick_once: 0,
  pick_speed: 'medium',
  next_spawn_at: 0,
  confirm_buy: 0,
  show_ids: 0,
  gambling: 1,
  greet_channel_id: null,
  greet_message: null,
  leave_channel_id: null,
  leave_message: null,
  boost_channel_id: null,
  boost_message: null,
};

function userFail(message, extra) {
  const error = new Error(message);
  error.userMessage = message;
  if (extra) Object.assign(error, extra);
  throw error;
}

function settle(fn) {
  try {
    return transaction(fn);
  } catch (error) {
    if (error.userMessage) return { error: error.userMessage, left: error.left };
    throw error;
  }
}

function settings(guildId) {
  const row = db.prepare('SELECT data FROM economy_settings WHERE guild_id = ?').get(guildId);
  const stored = row ? JSON.parse(row.data) : {};
  return { ...DEFAULTS, ...stored, guild_id: guildId };
}

function saveSettings(guildId, patch) {
  const next = { ...settings(guildId), ...patch };
  delete next.guild_id;
  db.prepare(`
    INSERT INTO economy_settings (guild_id, data) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data
  `).run(guildId, JSON.stringify(next));
  return settings(guildId);
}

function balanceOf(guildId, userId) {
  const row = db.prepare('SELECT amount FROM balances WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row ? row.amount : 0;
}

function credit(guildId, userId, amount) {
  const gain = money(amount);
  if (!gain) return balanceOf(guildId, userId);
  db.prepare(`
    INSERT INTO balances (guild_id, user_id, amount) VALUES (?, ?, MIN(?, ?))
    ON CONFLICT(guild_id, user_id) DO UPDATE SET amount = MIN(?, balances.amount + ?)
  `).run(guildId, userId, gain, 1_000_000_000_000, 1_000_000_000_000, gain);
  return balanceOf(guildId, userId);
}

function debit(guildId, userId, amount) {
  const loss = money(amount);
  if (loss == null) return false;
  if (loss === 0) return true;
  const result = db.prepare(`
    UPDATE balances SET amount = amount - ?
    WHERE guild_id = ? AND user_id = ? AND amount >= ?
  `).run(loss, guildId, userId, loss);
  return result.changes > 0;
}

function grantStart(guildId, userId, amount) {
  const row = db.prepare('SELECT 1 AS ok FROM balances WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (row) return balanceOf(guildId, userId);
  return credit(guildId, userId, amount);
}

function forgetMember(guildId, userId) {
  db.prepare('DELETE FROM balances WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  db.prepare('DELETE FROM inventory WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  db.prepare('DELETE FROM cooldowns WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  db.prepare('DELETE FROM reminders WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  db.prepare('DELETE FROM companions WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

function leaderboard(guildId, offset, limit) {
  return db.prepare(`
    SELECT user_id, amount FROM balances
    WHERE guild_id = ? AND amount > 0
    ORDER BY amount DESC, user_id ASC
    LIMIT ? OFFSET ?
  `).all(guildId, limit, offset);
}

function balanceCount(guildId) {
  return db.prepare('SELECT COUNT(*) AS n FROM balances WHERE guild_id = ? AND amount > 0').get(guildId).n;
}

function listShop(guildId) {
  return db.prepare('SELECT * FROM shop_items WHERE guild_id = ? ORDER BY name COLLATE NOCASE').all(guildId);
}

function shopNames(guildId) {
  return listShop(guildId).map((row) => row.name);
}

function getItem(guildId, name) {
  return db.prepare('SELECT * FROM shop_items WHERE guild_id = ? AND name = ? COLLATE NOCASE').get(guildId, name) || null;
}

function getItemById(id) {
  return db.prepare('SELECT * FROM shop_items WHERE id = ?').get(id) || null;
}

function addItem(fields) {
  return settle(() => {
    if (getItem(fields.guildId, fields.name)) userFail('The shop already has an item by that name.');
    const price = money(fields.price);
    if (price == null) userFail('Use a price from 0 up to 1000000000000.');
    let stock = null;
    if (fields.stock !== 0 && fields.stock != null) {
      stock = money(fields.stock);
      if (stock == null || stock < 1) userFail('Stock is 0 for unlimited, or a positive amount.');
    }
    let result;
    try {
      result = db.prepare(`
        INSERT INTO shop_items (
          guild_id, name, price, stock, description, role_id, require_role_id, remove_role_id, reply, giftable
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fields.guildId,
        fields.name,
        price,
        stock,
        fields.description || null,
        fields.role_id || null,
        fields.require_role_id || null,
        fields.remove_role_id || null,
        fields.reply || null,
        fields.giftable === 0 ? 0 : 1,
      );
    } catch (error) {
      if (String(error).includes('UNIQUE')) userFail('The shop already has an item by that name.');
      throw error;
    }
    return getItemById(Number(result.lastInsertRowid));
  });
}

function patchItem(guildId, currentName, patch) {
  return settle(() => {
    const item = getItem(guildId, currentName);
    if (!item) userFail('That item is not in the shop.');
    const next = {
      name: patch.name == null ? item.name : patch.name,
      price: patch.price == null ? item.price : money(patch.price),
      stock: patch.stock === undefined ? item.stock : (patch.stock === 0 ? null : money(patch.stock)),
      description: patch.description === undefined ? item.description : (patch.description || null),
      role_id: patch.role_id === undefined ? item.role_id : patch.role_id,
      require_role_id: patch.require_role_id === undefined ? item.require_role_id : patch.require_role_id,
      remove_role_id: patch.remove_role_id === undefined ? item.remove_role_id : patch.remove_role_id,
      reply: patch.reply === undefined ? item.reply : (patch.reply || null),
      giftable: patch.giftable == null ? item.giftable : (patch.giftable ? 1 : 0),
    };
    if (!next.name) userFail('Use an item name up to 32 characters, without @ or #.');
    if (next.price == null) userFail('That price is not valid.');
    if (patch.stock !== undefined && patch.stock !== 0 && next.stock == null) {
      userFail('Stock is 0 for unlimited, or a positive amount.');
    }
    if (next.name.toLowerCase() !== item.name.toLowerCase() && getItem(guildId, next.name)) {
      userFail('The shop already has an item by that name.');
    }
    db.prepare(`
      UPDATE shop_items
      SET name = ?, price = ?, stock = ?, description = ?, role_id = ?, require_role_id = ?,
          remove_role_id = ?, reply = ?, giftable = ?
      WHERE id = ?
    `).run(
      next.name,
      next.price,
      next.stock,
      next.description,
      next.role_id,
      next.require_role_id,
      next.remove_role_id,
      next.reply,
      next.giftable ? 1 : 0,
      item.id,
    );
    return getItemById(item.id);
  });
}

function removeItem(guildId, name) {
  const item = getItem(guildId, name);
  if (!item) return { error: 'That item is not in the shop.' };
  db.prepare('DELETE FROM shop_items WHERE id = ?').run(item.id);
  return { name: item.name };
}

function addInventory(guildId, userId, stack, quantity) {
  const qty = money(quantity);
  if (!qty) return;
  const existing = db.prepare(`
    SELECT * FROM inventory
    WHERE guild_id = ? AND user_id = ? AND name = ? COLLATE NOCASE
      AND item_id IS ? AND role_id IS ? AND remove_role_id IS ?
      AND IFNULL(reply, '') = IFNULL(?, '') AND giftable = ?
    ORDER BY id ASC LIMIT 1
  `).get(
    guildId,
    userId,
    stack.name,
    stack.item_id ?? null,
    stack.role_id ?? null,
    stack.remove_role_id ?? null,
    stack.reply ?? null,
    stack.giftable ? 1 : 0,
  );
  if (existing) {
    db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(qty, existing.id);
    return;
  }
  db.prepare(`
    INSERT INTO inventory (guild_id, user_id, item_id, name, quantity, role_id, remove_role_id, reply, giftable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    userId,
    stack.item_id ?? null,
    stack.name,
    qty,
    stack.role_id ?? null,
    stack.remove_role_id ?? null,
    stack.reply ?? null,
    stack.giftable ? 1 : 0,
  );
}

function purchase(guildId, userId, itemId, qty) {
  return settle(() => {
    const item = db.prepare('SELECT * FROM shop_items WHERE id = ? AND guild_id = ?').get(itemId, guildId);
    if (!item) userFail('That item is no longer in the shop.');
    const quote = quotePurchase(item, qty, balanceOf(guildId, userId));
    if (quote.error) userFail(quote.error);
    const owned = db.prepare(`
      SELECT COALESCE(SUM(quantity), 0) AS n FROM inventory
      WHERE guild_id = ? AND user_id = ? AND name = ? COLLATE NOCASE
    `).get(guildId, userId, item.name).n;
    if (owned + qty > 10000) userFail('Your inventory cannot hold more of that.');
    if (item.stock != null) {
      const updated = db.prepare('UPDATE shop_items SET stock = stock - ? WHERE id = ? AND stock >= ?').run(qty, item.id, qty);
      if (!updated.changes) userFail('Not enough stock.');
    }
    if (quote.cost > 0 && !debit(guildId, userId, quote.cost)) userFail('You do not have enough for that.');
    addInventory(guildId, userId, item, qty);
    return { item, cost: quote.cost, balance: balanceOf(guildId, userId) };
  });
}

function inventoryOf(guildId, userId) {
  return db.prepare(`
    SELECT name, SUM(quantity) AS quantity
    FROM inventory
    WHERE guild_id = ? AND user_id = ?
    GROUP BY name COLLATE NOCASE
    ORDER BY name COLLATE NOCASE
  `).all(guildId, userId);
}

function inventoryNames(guildId, userId) {
  return inventoryOf(guildId, userId).map((row) => row.name);
}

function peekItem(guildId, userId, name) {
  return db.prepare(`
    SELECT * FROM inventory
    WHERE guild_id = ? AND user_id = ? AND name = ? COLLATE NOCASE AND quantity > 0
    ORDER BY id ASC LIMIT 1
  `).get(guildId, userId, name) || null;
}

function takeItem(guildId, userId, name) {
  return settle(() => {
    const stack = peekItem(guildId, userId, name);
    if (!stack) userFail('You do not have that item.');
    if (stack.quantity <= 1) db.prepare('DELETE FROM inventory WHERE id = ?').run(stack.id);
    else db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?').run(stack.id);
    return stack;
  });
}

function restoreItem(guildId, userId, stack) {
  addInventory(guildId, userId, stack, 1);
}

function giveItems(guildId, fromId, toId, name, qty) {
  return settle(() => {
    if (fromId === toId) userFail('Pick someone else.');
    const amount = money(qty);
    if (amount == null || amount < 1 || amount > 100) userFail('Give between 1 and 100.');
    const stacks = db.prepare(`
      SELECT * FROM inventory
      WHERE guild_id = ? AND user_id = ? AND name = ? COLLATE NOCASE AND quantity > 0
      ORDER BY id ASC
    `).all(guildId, fromId, name);
    if (!stacks.length) userFail('You do not have that item.');
    const giftable = stacks.filter((stack) => stack.giftable);
    if (!giftable.length) userFail('That item cannot be given.');
    const total = giftable.reduce((sum, stack) => sum + stack.quantity, 0);
    if (total < amount) {
      userFail(giftable.length === stacks.length
        ? 'You do not have that many.'
        : 'Some of those cannot be given, and you do not have enough that can.');
    }
    let left = amount;
    for (const stack of giftable) {
      if (left < 1) break;
      const move = Math.min(left, stack.quantity);
      if (stack.quantity === move) db.prepare('DELETE FROM inventory WHERE id = ?').run(stack.id);
      else db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(move, stack.id);
      addInventory(guildId, toId, stack, move);
      left -= move;
    }
    return { name: giftable[0].name, quantity: amount };
  });
}

function collectEarn(guildId, userId, recipientId, amount, action, cooldownMs, now) {
  return settle(() => {
    const row = db.prepare(`
      SELECT ready_at FROM cooldowns WHERE guild_id = ? AND user_id = ? AND action = ?
    `).get(guildId, userId, action);
    if (row && row.ready_at > now) userFail('cooldown', { left: row.ready_at - now });
    const value = money(amount);
    if (value == null || value < 1) userFail('Nothing to collect.');
    credit(guildId, recipientId, value);
    const readyAt = now + cooldownMs;
    db.prepare(`
      INSERT INTO cooldowns (guild_id, user_id, action, ready_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id, action) DO UPDATE SET ready_at = excluded.ready_at
    `).run(guildId, userId, action, readyAt);
    return { balance: balanceOf(guildId, recipientId), amount: value, readyAt };
  });
}

function armCooldown(guildId, userId, action, readyAt) {
  db.prepare(`
    INSERT INTO cooldowns (guild_id, user_id, action, ready_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, action) DO UPDATE SET ready_at = excluded.ready_at
  `).run(guildId, userId, action, readyAt);
}

function cooldownLeft(guildId, userId, action, now) {
  const row = db.prepare(`
    SELECT ready_at FROM cooldowns WHERE guild_id = ? AND user_id = ? AND action = ?
  `).get(guildId, userId, action);
  if (!row || row.ready_at <= now) return 0;
  return row.ready_at - now;
}

function claimCake(guildId, userId, amount, token) {
  return settle(() => {
    const action = `cake:${token}`;
    const existing = db.prepare(`
      SELECT 1 AS ok FROM cooldowns WHERE guild_id = ? AND user_id = ? AND action = ?
    `).get(guildId, userId, action);
    if (existing) userFail('You already took that one.');
    db.prepare(`
      INSERT INTO cooldowns (guild_id, user_id, action, ready_at) VALUES (?, ?, ?, ?)
    `).run(guildId, userId, action, Date.now());
    const balance = credit(guildId, userId, amount);
    return { balance, amount };
  });
}

function setReminder(guildId, userId, action, readyAt) {
  db.prepare(`
    INSERT INTO reminders (guild_id, user_id, action, ready_at, sent) VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(guild_id, user_id, action) DO UPDATE SET ready_at = excluded.ready_at, sent = 0
  `).run(guildId, userId, action, readyAt);
}

function dueReminders(now) {
  return db.prepare('SELECT * FROM reminders WHERE sent = 0 AND ready_at <= ?').all(now);
}

function markReminder(guildId, userId, action) {
  db.prepare('UPDATE reminders SET sent = 1 WHERE guild_id = ? AND user_id = ? AND action = ?').run(guildId, userId, action);
}

function transfer(guildId, fromId, toId, amount, received) {
  return settle(() => {
    if (!debit(guildId, fromId, amount)) userFail('You do not have that much.');
    return { balance: credit(guildId, toId, received) };
  });
}

function wager(guildId, userId, bet, multiplier) {
  return settle(() => {
    const value = money(bet);
    if (value == null || value < 1) userFail('Enter a bet of at least 1.');
    if (!debit(guildId, userId, value)) userFail('You do not have that much.');
    if (multiplier > 0) {
      const payout = value * multiplier;
      if (!Number.isSafeInteger(payout) || payout > 1_000_000_000_000) userFail('That payout is too large.');
      credit(guildId, userId, payout);
    }
    return { balance: balanceOf(guildId, userId) };
  });
}

function createDrop(fields) {
  return settle(() => {
    const amount = money(fields.amount);
    if (amount == null || amount < 1) userFail('Enter an amount of at least 1.');
    if (fields.userId && !debit(fields.guildId, fields.userId, amount)) userFail('You do not have that much.');
    const result = db.prepare(`
      INSERT INTO drops (guild_id, channel_id, user_id, remaining, code, once_only, created_at, closed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      fields.guildId,
      fields.channelId,
      fields.userId || null,
      amount,
      fields.code || null,
      fields.onceOnly ? 1 : 0,
      Date.now(),
    );
    return { id: Number(result.lastInsertRowid), code: fields.code || null, amount };
  });
}

function setDropMessage(id, messageId) {
  db.prepare('UPDATE drops SET message_id = ? WHERE id = ?').run(messageId, id);
}

function closeDrop(id) {
  db.prepare('UPDATE drops SET closed = 1, remaining = 0 WHERE id = ?').run(id);
}

function latestDrop(guildId, channelId) {
  return db.prepare(`
    SELECT * FROM drops
    WHERE guild_id = ? AND channel_id = ? AND closed = 0 AND remaining > 0
    ORDER BY id DESC LIMIT 1
  `).get(guildId, channelId) || null;
}

function openDrop(guildId, channelId) {
  return latestDrop(guildId, channelId);
}

function getDrop(id) {
  return db.prepare('SELECT * FROM drops WHERE id = ?').get(id) || null;
}

function claimDrop(dropId, userId, code, range) {
  return settle(() => {
    const drop = db.prepare('SELECT * FROM drops WHERE id = ?').get(dropId);
    if (!drop || drop.closed || drop.remaining < 1) userFail('That drop is gone.');
    if (drop.code && String(code || '').trim().toUpperCase() !== drop.code) {
      userFail(code ? 'That code does not match.' : 'This drop needs the code from the message.');
    }
    const already = db.prepare('SELECT 1 AS ok FROM drop_claims WHERE drop_id = ? AND user_id = ?').get(dropId, userId);
    if (already) userFail('You already picked that up.');
    const prior = db.prepare('SELECT COUNT(*) AS n FROM drop_claims WHERE drop_id = ?').get(dropId).n;
    if (drop.once_only && prior > 0) userFail('Someone else got there first.');
    let take = drop.remaining;
    if (!drop.once_only) {
      const low = Math.min(range.min, drop.remaining);
      const high = Math.min(Math.max(range.min, range.max), drop.remaining);
      const span = Math.max(1, high);
      const floor = Math.max(1, low);
      take = floor + Math.floor(Math.random() * (Math.max(floor, span) - floor + 1));
      if (take > drop.remaining) take = drop.remaining;
    }
    const updated = db.prepare(`
      UPDATE drops
      SET remaining = remaining - ?, closed = CASE WHEN remaining - ? <= 0 THEN 1 ELSE 0 END
      WHERE id = ? AND remaining >= ?
    `).run(take, take, dropId, take);
    if (!updated.changes) userFail('That drop is gone.');
    db.prepare('INSERT INTO drop_claims (drop_id, user_id, amount) VALUES (?, ?, ?)').run(dropId, userId, take);
    credit(drop.guild_id, userId, take);
    return { amount: take, remaining: drop.remaining - take };
  });
}

function listPickChannels(guildId) {
  return db.prepare('SELECT channel_id FROM pick_channels WHERE guild_id = ? ORDER BY channel_id').all(guildId)
    .map((row) => row.channel_id);
}

function addPickChannel(guildId, channelId) {
  db.prepare('INSERT OR IGNORE INTO pick_channels (guild_id, channel_id) VALUES (?, ?)').run(guildId, channelId);
}

function removePickChannel(guildId, channelId) {
  db.prepare('DELETE FROM pick_channels WHERE guild_id = ? AND channel_id = ?').run(guildId, channelId);
}

function dueSpawnGuilds(now) {
  return db.prepare('SELECT guild_id, data FROM economy_settings').all()
    .map((row) => ({ ...DEFAULTS, ...JSON.parse(row.data), guild_id: row.guild_id }))
    .filter((row) => row.next_spawn_at > 0 && row.next_spawn_at <= now);
}

function createEvent(fields) {
  const amount = money(fields.amount);
  if (amount == null || amount < 1) return { error: 'Enter an amount of at least 1.' };
  const active = db.prepare(`
    SELECT id FROM currency_events WHERE guild_id = ? AND channel_id = ? AND active = 1
  `).get(fields.guildId, fields.channelId);
  if (active) return { error: 'End the current event in that channel first.' };
  try {
    const result = db.prepare(`
      INSERT INTO currency_events (guild_id, channel_id, amount, label, description, active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(
      fields.guildId,
      fields.channelId,
      amount,
      (fields.label || 'Claim').slice(0, 80),
      fields.description || null,
      Date.now(),
    );
    return { id: Number(result.lastInsertRowid), amount };
  } catch (error) {
    if (String(error).includes('UNIQUE')) return { error: 'End the current event in that channel first.' };
    throw error;
  }
}

function setEventMessage(id, messageId) {
  db.prepare('UPDATE currency_events SET message_id = ? WHERE id = ?').run(messageId, id);
}

function endEvents(guildId, channelId) {
  const rows = db.prepare(`
    SELECT * FROM currency_events WHERE guild_id = ? AND channel_id = ? AND active = 1
  `).all(guildId, channelId);
  db.prepare(`
    UPDATE currency_events SET active = 0 WHERE guild_id = ? AND channel_id = ? AND active = 1
  `).run(guildId, channelId);
  return rows;
}

function claimEvent(eventId, userId) {
  return settle(() => {
    const event = db.prepare('SELECT * FROM currency_events WHERE id = ? AND active = 1').get(eventId);
    if (!event) userFail('That event is over.');
    const inserted = db.prepare('INSERT OR IGNORE INTO event_claims (event_id, user_id) VALUES (?, ?)').run(eventId, userId);
    if (!inserted.changes) userFail('You already claimed that.');
    const balance = credit(event.guild_id, userId, event.amount);
    return { amount: event.amount, balance };
  });
}

function listResponders(guildId) {
  return db.prepare('SELECT * FROM autoresponders WHERE guild_id = ? ORDER BY trigger COLLATE NOCASE').all(guildId);
}

function getResponder(guildId, trigger) {
  return db.prepare('SELECT * FROM autoresponders WHERE guild_id = ? AND trigger = ? COLLATE NOCASE').get(guildId, trigger) || null;
}

function upsertResponder(guildId, trigger, reply, matchMode) {
  db.prepare(`
    INSERT INTO autoresponders (guild_id, trigger, reply, match_mode) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, trigger) DO UPDATE SET reply = excluded.reply, match_mode = excluded.match_mode
  `).run(guildId, trigger, reply, matchMode || 'contains');
}

function updateResponder(guildId, trigger, patch) {
  const row = getResponder(guildId, trigger);
  if (!row) return null;
  upsertResponder(guildId, row.trigger, patch.reply == null ? row.reply : patch.reply, patch.match_mode || row.match_mode);
  return getResponder(guildId, row.trigger);
}

function removeResponder(guildId, trigger) {
  return db.prepare('DELETE FROM autoresponders WHERE guild_id = ? AND trigger = ? COLLATE NOCASE').run(guildId, trigger).changes;
}

function getCompanion(guildId, userId) {
  return db.prepare('SELECT * FROM companions WHERE guild_id = ? AND user_id = ?').get(guildId, userId) || null;
}

function saveCompanion(pet) {
  db.prepare(`
    INSERT INTO companions (guild_id, user_id, name, happiness, lifetime_ms, food, stars, last_tick)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      name = excluded.name,
      happiness = excluded.happiness,
      lifetime_ms = excluded.lifetime_ms,
      food = excluded.food,
      stars = excluded.stars,
      last_tick = excluded.last_tick
  `).run(pet.guild_id, pet.user_id, pet.name, pet.happiness, pet.lifetime_ms, pet.food, pet.stars, pet.last_tick);
}

function deleteCompanion(guildId, userId) {
  db.prepare('DELETE FROM companions WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

function resetUserBalance(guildId, userId) {
  db.prepare('DELETE FROM balances WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

function resetUserInventory(guildId, userId) {
  db.prepare('DELETE FROM inventory WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

function resetBalances(guildId) {
  db.prepare('DELETE FROM balances WHERE guild_id = ?').run(guildId);
}

function resetInventories(guildId) {
  db.prepare('DELETE FROM inventory WHERE guild_id = ?').run(guildId);
}

function resetShop(guildId) {
  db.prepare('DELETE FROM shop_items WHERE guild_id = ?').run(guildId);
}

function resetEvents(guildId) {
  const rows = db.prepare('SELECT * FROM currency_events WHERE guild_id = ? AND active = 1').all(guildId);
  db.prepare('UPDATE currency_events SET active = 0 WHERE guild_id = ? AND active = 1').run(guildId);
  return rows;
}

module.exports = {
  settings,
  saveSettings,
  balanceOf,
  credit,
  debit,
  grantStart,
  forgetMember,
  leaderboard,
  balanceCount,
  listShop,
  shopNames,
  getItem,
  getItemById,
  addItem,
  patchItem,
  removeItem,
  purchase,
  inventoryOf,
  inventoryNames,
  peekItem,
  takeItem,
  restoreItem,
  giveItems,
  collectEarn,
  armCooldown,
  cooldownLeft,
  claimCake,
  setReminder,
  dueReminders,
  markReminder,
  transfer,
  wager,
  createDrop,
  setDropMessage,
  closeDrop,
  latestDrop,
  openDrop,
  getDrop,
  claimDrop,
  listPickChannels,
  addPickChannel,
  removePickChannel,
  dueSpawnGuilds,
  createEvent,
  setEventMessage,
  endEvents,
  claimEvent,
  listResponders,
  getResponder,
  upsertResponder,
  updateResponder,
  removeResponder,
  getCompanion,
  saveCompanion,
  deleteCompanion,
  resetUserBalance,
  resetUserInventory,
  resetBalances,
  resetInventories,
  resetShop,
  resetEvents,
};
