'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), '0gbot-'));

const { ApplicationCommandOptionType } = require('discord.js');
const { loadCommands } = require('./load-commands');
const db = require('./db');
const parse = require('./lib/parse');
const { emptyPayload, isEmptyPayload, buildStoredEmbed } = require('./lib/stored-embed');
const { presets, payloadLength } = require('./lib/presets');
const { pageBody, renderPage } = require('./lib/page');
const { renderPoll } = require('./features/polls');

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function walkCommand(command) {
  assert(command.description && command.description.length <= 100, `${command.name} description length`);
  assert(/^[a-z0-9_-]{1,32}$/.test(command.name), `${command.name} name`);
  for (const option of command.options || []) walkOption(option, command.name);
}

function walkOption(option, pathName) {
  const here = `${pathName} ${option.name}`;
  assert(option.description && option.description.length <= 100, `${here} description`);
  assert(/^[a-z0-9_-]{1,32}$/.test(option.name), `${here} name`);
  if (option.type === ApplicationCommandOptionType.Subcommand
    || option.type === ApplicationCommandOptionType.SubcommandGroup) {
    assert((option.options || []).length <= 25, `${here} has too many options`);
    let optional = false;
    for (const child of option.options || []) {
      if (child.type === ApplicationCommandOptionType.Subcommand
        || child.type === ApplicationCommandOptionType.SubcommandGroup) {
        walkOption(child, here);
        continue;
      }
      if (child.required && optional) failures.push(`${here} lists required ${child.name} after an optional option`);
      if (!child.required) optional = true;
      walkOption(child, here);
    }
  }
  if (option.choices) {
    assert(option.choices.length <= 25, `${here} has too many choices`);
    for (const choice of option.choices) {
      assert(choice.name.length <= 100 && String(choice.value).length <= 100, `${here} choice ${choice.name}`);
    }
  }
}

const commands = loadCommands();
const expected = ['help', 'profile', 'reactionrole', 'poll', 'confess', 'embed', 'system', 'focus', 'ticket', 'mod', 'automod', 'ambient', 'shop', 'cash', 'cashset', 'companion', 'autoresponder', 'greet', 'hotlines', 'verify'];
assert(commands.size === expected.length, `expected ${expected.length} commands, found ${commands.size}`);
for (const name of expected) {
  assert(commands.has(name), `missing /${name}`);
}
for (const command of commands.values()) walkCommand(command.data.toJSON());

assert(parse.parseColor('#007AFF') === 0x007aff, 'parseColor');
assert(parse.parseColor('none') === null, 'parseColor clear');
assert(parse.parseColor('nope')?.error, 'parseColor invalid');
assert(parse.parseDuration('2h') === 7_200_000, 'parseDuration');
assert(parse.parseDuration('10s')?.error, 'parseDuration too short');
assert(parse.parseMessageRef('https://discord.com/channels/1/2/3')?.messageId === '3', 'message link');
assert(parse.embedName('Welcome-1') === 'welcome-1', 'embed name');
assert(parse.embedName('has space') === null, 'embed name spaces');
const choices = parse.splitPollOptions(' Yes | No | Yes ');
assert(choices.error, 'duplicate poll choice');
assert(parse.splitPollOptions('Yes | No').join() === 'Yes,No', 'poll choices');
assert(parse.neutralizePings('@everyone').includes('\u200b'), 'neutralize pings');
assert(parse.parseHttpUrl('https://example.com/a') === 'https://example.com/a', 'url');
assert(parse.parseHttpUrl('none', { allowClear: true }) === null, 'url clear');

const payload = emptyPayload();
assert(isEmptyPayload(payload), 'empty payload');
payload.title = 'Hello';
payload.color = 0x007aff;
payload.fields = [{ name: 'One', value: 'Two', inline: true }];
payload.timestamp = true;
const built = buildStoredEmbed(payload);
assert(built.data.title === 'Hello', 'stored title');
assert(built.data.fields[0].inline === true, 'stored field');
assert(!isEmptyPayload(payload), 'payload not empty');

const profile = db.saveProfile('user-1', {
  display_name: 'Ada',
  pronouns: 'she/her',
  tagline: 'building small things',
  bio: 'A short page.',
  location: 'Bangkok',
  accent: 0x1d1d1f,
  links: [{ label: 'Site', url: 'https://example.com' }],
});
assert(profile.links.length === 1, 'profile link saved');
assert(pageBody(profile).includes('———'), 'page body divider');
const page = renderPage({
  id: 'user-1',
  username: 'ada',
  globalName: 'Ada Lovelace',
  displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
}, profile, 'user-1');
assert(page.embeds[0].data.title === 'Ada', 'page title');
assert(page.embeds[0].data.footer.text.includes('Bangkok'), 'page location');
assert(page.components.length === 1, 'page link stack');
assert(db.deleteProfile('user-1') === 1, 'profile reset');

const single = db.createPoll({
  guildId: 'guild',
  channelId: 'channel',
  question: 'Ship it?',
  multi: false,
  anonymous: false,
  endsAt: null,
  createdBy: 'owner',
  labels: ['Yes', 'No'],
});
const singleOptions = db.pollTally(single.id);
assert(db.castVote(single, singleOptions[0].id, 'voter') === 'added', 'vote add');
assert(db.castVote(single, singleOptions[1].id, 'voter') === 'added', 'vote move');
let tally = db.pollTally(single.id);
assert(tally[0].votes === 0 && tally[1].votes === 1, 'single choice moves the vote');
assert(db.castVote(single, singleOptions[1].id, 'voter') === 'removed', 'vote remove');
const view = renderPoll(single);
assert(view.embeds[0].data.title === 'Ship it?', 'poll title');
assert(view.components.length === 2, 'poll rows include voters');

const multi = db.createPoll({
  guildId: 'guild',
  channelId: 'channel',
  question: 'Pick any',
  multi: true,
  anonymous: true,
  endsAt: Date.now() - 1000,
  createdBy: 'owner',
  labels: ['A', 'B'],
});
const multiOptions = db.pollTally(multi.id);
db.castVote(multi, multiOptions[0].id, 'voter');
db.castVote(multi, multiOptions[1].id, 'voter');
tally = db.pollTally(multi.id);
assert(tally[0].votes === 1 && tally[1].votes === 1, 'multi vote keeps both');
assert(renderPoll(multi).components.length === 1, 'anonymous poll has no voters button');
assert(db.duePolls(Date.now()).some((poll) => poll.id === multi.id), 'due poll');

const first = db.allocateConfession('guild', 'author', 'hello');
const second = db.allocateConfession('guild', 'author', 'again');
assert(first.number === 1 && second.number === 2, 'confession numbers');
assert(db.claimPendingConfession(first.id)?.status === 'posting', 'claim confession');
assert(db.claimPendingConfession(first.id) === null, 'claim is single use');

const panel = db.createPanel({
  guild_id: 'guild',
  channel_id: 'channel',
  message_id: 'message',
  title: 'Colors',
  description: 'Pick one',
  color: 0x007aff,
  mode: 'button',
  exclusive: 1,
});
const option = db.addPanelOption({
  panel_id: panel.id,
  role_id: 'role',
  emoji: '🔵',
  label: 'Blue',
  style: 'Primary',
});
assert(db.getPanelByMessage('message')?.id === panel.id, 'panel lookup');
assert(db.getPanelOption(option.id)?.label === 'Blue', 'option lookup');
db.deletePanel(panel.id);
assert(db.panelOptions(panel.id).length === 0, 'deleting a panel removes its roles');
assert(db.getPanel(panel.id) === null, 'panel deleted');

db.createEmbed('guild', 'welcome', { ...emptyPayload(), title: 'Welcome' }, 'owner');
assert(db.embedNames('guild').includes('welcome'), 'embed list');
assert(db.getEmbed('guild', 'welcome').payload.title === 'Welcome', 'embed read');
assert(db.deleteEmbed('guild', 'welcome') === 1, 'embed delete');

for (const [name, payload] of Object.entries(presets)) {
  const text = [
    payload.title,
    payload.description,
    payload.footer?.text,
    ...(payload.fields || []).flatMap((field) => [field.name, field.value]),
  ].join('\n');
  assert(!/[A-Z]/.test(text), `${name} stays lowercase`);
  if (name === 'welcome') assert(payload.ping === true && !payload.title.includes('{user}'), 'welcome pings outside the embed');
  assert(payloadLength(payload) <= 6000, `${name} embed size`);
  assert((payload.fields || []).length <= 25, `${name} field count`);
  for (const field of payload.fields || []) {
    assert(field.name.length <= 256 && field.value.length > 0 && field.value.length <= 1024, `${name} field ${field.name}`);
  }
  assert(buildStoredEmbed(payload).data.title === payload.title, `${name} builds`);
}

const { matchProxy, proxyName } = require('./lib/proxy-match');
const { hasInvite, spamVerdict, advancePhase } = require('./lib/guard');
const store = require('./store');

const proxied = matchProxy('jay: hello there', [{ id: 1, name: 'Jay', tag_prefix: 'jay:', tag_suffix: '' }]);
assert(proxied.inner === 'hello there', 'proxy tag');
const wrapped = matchProxy('[hello]', [{ id: 2, name: 'Bea', tag_prefix: '[', tag_suffix: ']' }]);
assert(wrapped.inner === 'hello', 'proxy brackets');
assert(matchProxy('\\jay: hello', []).escaped === 'jay: hello', 'proxy escape');
assert(proxyName({ name: 'Jay' }, { tag: 'OR' }) === 'Jay | OR', 'proxy display name');
assert(hasInvite('see discord.gg/orbit'), 'invite link');
assert(!hasInvite('https://discord.com/channels/1/2/3'), 'message link is not an invite');
assert(spamVerdict([
  { at: 1_000, content: 'same' },
  { at: 2_000, content: 'same' },
  { at: 3_000, content: 'same' },
], 'same', 4_000).dupes, 'repeated spam');
const phase = advancePhase({ phase: 'work', phase_ends_at: 0, break_ms: 1_000, work_ms: 2_000, round: 1 }, 50);
assert(phase.changed && phase.phase === 'break', 'focus phase');
const firstCase = store.nextCase('guild', 'warn', 'member', 'mod', 'reason');
const secondCase = store.nextCase('guild', 'warn', 'member', 'mod', 'again');
assert(firstCase.number === 1 && secondCase.number === 2, 'case numbers');
const headmate = store.addHeadmate({
  user_id: 'owner',
  guild_id: 'guild',
  name: 'Jay',
  avatar_url: null,
  pronouns: 'they/them',
  bio: null,
  tag_prefix: 'jay:',
  tag_suffix: null,
});
store.setFront('guild', 'owner', headmate.id);
assert(store.listFronts('guild', 'owner')[0].name === 'Jay', 'front tracking');
assert(parse.parseTimeout('1h') === 3_600_000, 'timeout length');
assert(parse.parseTimeout('10s')?.error, 'timeout too short');

const econ = require('./lib/economy');
const economyStore = require('./store-economy');
const templates = require('./lib/templates');
const hotlines = require('./features/hotlines');

assert(econ.quotePurchase({ price: 5, stock: null }, 2, 10).cost === 10, 'quote unlimited');
assert(econ.quotePurchase({ price: 5, stock: 1 }, 2, 100).error, 'quote stock');
assert(econ.diceOutcome(64) === 0 && econ.diceOutcome(65) === 2 && econ.diceOutcome(91) === 4 && econ.diceOutcome(100) === 10, 'dice');
assert(econ.slotPayout(['a', 'a', 'b']) === 2 && econ.slotPayout(['a', 'a', 'a']) === 5 && econ.slotPayout(['a', 'b', 'c']) === 0, 'slots');
assert(econ.transferSplit(100, 10, 100).received === 90, 'tax');
assert(econ.tuneRange(1, 10, 20, null).max === 20, 'range');
assert(econ.pickResponder([
  { trigger: 'hi', match_mode: 'contains', reply: 'c' },
  { trigger: 'hi', match_mode: 'exact', reply: 'e' },
], 'hi').reply === 'e', 'responder rank');
const pet = econ.newCompanion('g', 'u', 'Miso', 0);
const later = econ.tickCompanion({ ...pet, last_tick: 0, lifetime_ms: econ.DAY }, econ.HOUR);
assert(later.lifetime_ms === econ.DAY - econ.HOUR, 'pet tick');
assert(econ.applyActivity('feed', { ...pet, food: 0, happiness: 80 }, null).error, 'feed needs food');
assert(templates.fillTemplate('hi {user_name}', { userName: 'Jay' }) === 'hi Jay', 'template');
assert(templates.fillTemplate('{username} {user}', { userName: 'Jules', user: '<@1>' }) === 'jules <@1>', 'lowercase username');
assert(templates.fillPayload(presets.leave, { userName: 'Jules' }).title === '🌌 jules has drifted out of orbit', 'leave name');
db.createEmbed('guild', 'welcome', presets.welcome, 'owner');
const welcomed = templates.renderFilled('guild', '{embed:welcome}', { user: '<@1>', userName: 'Jules' });
assert(welcomed.content === '<@1>', 'welcome ping is outside the embed');
assert(!welcomed.embeds[0].data.title.includes('<@'), 'welcome title has no mention');
assert(!/[A-Z]/.test(`${welcomed.embeds[0].data.title}\n${welcomed.embeds[0].data.description}`), 'welcome stays lowercase');
db.deleteEmbed('guild', 'welcome');
assert(templates.splitEmbedToken('hello {embed:welcome}').embedName === 'welcome', 'embed token');

const added = economyStore.addItem({ guildId: 'shopguild', name: 'cookie', price: 5, stock: 0 });
assert(!added.error && added.stock == null, 'unlimited stock');
economyStore.credit('shopguild', 'buyer', 20);
const bought = economyStore.purchase('shopguild', 'buyer', added.id, 2);
assert(bought.cost === 10 && bought.balance === 10, 'purchase');
assert(economyStore.getItemById(added.id).stock == null, 'stock stays unlimited');
economyStore.patchItem('shopguild', 'cookie', { stock: 1 });
const sold = economyStore.purchase('shopguild', 'buyer', added.id, 1);
assert(!sold.error && economyStore.getItemById(added.id).stock === 0, 'finite stock hits zero');
assert(economyStore.purchase('shopguild', 'buyer', added.id, 1).error, 'sold out');
const kept = economyStore.peekItem('shopguild', 'buyer', 'cookie');
assert(kept && kept.quantity === 3, 'inventory keeps older copies');
const event = economyStore.createEvent({ guildId: 'shopguild', channelId: 'chan', amount: 5 });
assert(economyStore.claimEvent(event.id, 'buyer').amount === 5, 'event claim');
assert(economyStore.claimEvent(event.id, 'buyer').error, 'event once');
assert(hotlines.searchLines('usa').length === 1, 'hotline alias');
assert(hotlines.searchLines('atlantis').length === 0, 'unknown hotline');

const { phraseMatches, accountTooNew } = require('./lib/verify');
assert(phraseMatches('I agree', ' i agree '), 'verify phrase');
assert(!phraseMatches('I agree', 'no'), 'verify phrase miss');
assert(phraseMatches(null, ''), 'verify button gate');
assert(accountTooNew(1_000, 1, 1_000 + 30 * 60 * 1000), 'account too new');
assert(!accountTooNew(0, 1, 2 * 60 * 60 * 1000), 'account old enough');
assert(!accountTooNew(Date.now(), 0, Date.now()), 'age check off');
const savedVerify = db.saveSettings('guild', { verify_role_id: 'verified', verify_phrase: 'i agree', verify_min_hours: 2 });
assert(savedVerify.verify_role_id === 'verified' && savedVerify.verify_phrase === 'i agree' && savedVerify.verify_min_hours === 2, 'verify settings');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Smoke test passed (${commands.size} commands, database in ${process.env.DATA_DIR}).`);
