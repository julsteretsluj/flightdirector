'use strict';

const { EmbedBuilder } = require('discord.js');
const { guildCommand } = require('../lib/command');
const { ACCENT } = require('../lib/parse');
const { ephemeral } = require('../lib/discord');

const TOPICS = {
  profile: {
    title: 'Profile',
    description: [
      'A personal page in the shape of a Carrd: a name, pronouns, one intro line, a short bio, a place, a banner, and up to five links stacked underneath.',
      'The page follows you across servers this bot is in.',
      '',
      '`/profile edit` opens the page editor. Type `-` in a field to clear it.',
      '`/profile style color:#1D1D1F banner:https://…` sets the accent and banner. Use `none` to clear the banner.',
      '`/profile link-add label:Portfolio url:https://…` adds a link. Adding the same label again updates it.',
      '`/profile view` shows a page. `hide:True` keeps it to yourself.',
      '`/profile post` shares your page in a channel.',
    ].join('\n'),
  },
  roles: {
    title: 'Reaction roles',
    description: [
      'Post a panel, then attach roles. Members toggle a role with a button or a reaction.',
      'The bot role must sit above every role it hands out.',
      '',
      '`/reactionrole panel channel:#roles title:Colors mode:Buttons exclusive:True`',
      '`/reactionrole add message:<link> role:@Blue emoji:🔵 label:Blue style:Primary`',
      'Reaction mode needs an emoji on every role. Button mode can use a label alone.',
      'Exclusive panels keep a single role from that panel.',
      'Use the same panel for pronouns, communication preferences, ping roles, or access to a private channel. Give that role permission to see the channel in its settings. The bot only toggles the role.',
      '`/reactionrole remove` and `/reactionrole delete` take the same message link.',
    ].join('\n'),
  },
  polls: {
    title: 'Polls',
    description: [
      '`/poll create question:Ship it? options:Yes | Not yet | Needs work`',
      'Separate choices with `|`. Two to ten choices, each up to 80 characters.',
      '`multi:True` allows more than one choice. `anonymous:True` hides names.',
      '`duration:2h` closes the poll later. Units are `s`, `m`, `h`, and `d`, up to 7 days.',
      'Click a choice to vote, and click it again to take the vote back.',
      '`/poll end message:<link>` closes it. The author or a moderator can do that.',
    ].join('\n'),
  },
  confessions: {
    title: 'Confessions',
    description: [
      '`/confess setup channel:#confessions log:#mod-log review:True`',
      'The log channel should be moderator-only. Author names are written there and nowhere public.',
      'Review holds each confession until a moderator approves it.',
      '`/confess send` opens a private box. Replies use the button on the post and stay anonymous.',
      'Run `/confess setup` with no options to see the current configuration.',
    ].join('\n'),
  },
  embeds: {
    title: 'Embeds',
    description: [
      'Save a message once, then send it into any channel.',
      '',
      '`/embed create name:welcome title:Welcome description:Grab a role in #roles color:#007AFF`',
      '`/embed field-add name:welcome label:Rules value:Be kind inline:False`',
      '`/embed media`, `/embed author`, and `/embed footer` fill the rest. Use `none` to clear a text or URL.',
      '`/embed preset preset:rules` saves the flight manual. `preset:map` saves the sector map. `preset:welcome` saves the join embed. `preset:leave` saves the goodbye.',
      'The welcome ping is the message above the embed, so Discord can notify the new member. `{username}` in the goodbye is the member\'s name in lowercase.',
      'Add `channel:` to post a preset. For joins, run `/greet message message:{embed:welcome}`. For leaves, run `/greet leave-message message:{embed:leave}`.',
      '`/embed preview name:welcome` shows it to you.',
      '`/embed send name:welcome channel:#welcome` posts it.',
      'Names are lowercase letters, numbers, and hyphens.',
    ].join('\n'),
  },
  system: {
    title: 'System and proxy',
    description: [
      'Post as a headmate without a second Discord account. This is for your own system or personas, in this server only.',
      '',
      '`/system setup name:Orbit` then `/system member-add name:Jay prefix:jay:`',
      'A message that starts with `jay:` is deleted and re-sent under Jay\'s name and avatar.',
      'Start a message with `\\` to send it as yourself.',
      '`/system front member:Jay` tracks who is fronting. `/system autoproxy` can proxy untagged messages while one person is front, or stick with the last person who spoke.',
      'The bot needs Manage Messages and Manage Webhooks in the channel.',
    ].join('\n'),
  },
  focus: {
    title: 'Focus and check-ins',
    description: [
      '`/focus start work:25 break:5 intention:Draft the intro` posts a shared sprint.',
      'Join, set an intention, and mark it done from the buttons. The timer switches between work and break and pings the people in the sprint.',
      '`/focus checkin text:Reply to one message` is a smaller check-in with no timer.',
    ].join('\n'),
  },
  tickets: {
    title: 'Tickets',
    description: [
      '`/ticket setup category:#staff-notes staff:@Crew` then `/ticket panel channel:#control-tower`.',
      'The button opens a private channel for that member and the staff role.',
      'Close it from the button or with `/ticket close`. A short transcript goes to the automod log if one is set.',
    ].join('\n'),
  },
  mod: {
    title: 'Moderation',
    description: [
      '`/automod config log:#mod-log invites:True spam:True raid:8`',
      'Edits, deletions, warnings, timeouts, kicks, and bans are written there as cases.',
      '`/mod warn`, `/mod timeout length:1h`, `/mod kick`, and `/mod ban` record a reason.',
      'Invite links and message spam are removed. Three hits in ten minutes is a five-minute timeout. Staff are exempt.',
      '`/automod lockdown` adds 10 seconds of slowmode to channels that had none. `/automod unlock` removes only that slowmode.',
      'A join spike posts an alert. Auto lockdown is off until you turn it on.',
    ].join('\n'),
  },
  ambient: {
    title: 'Ambient noise',
    description: [
      '`/ambient join` plays quiet generated noise in the voice channel you are in. It is not a music stream.',
      '`/ambient leave` disconnects. The bot also leaves when the channel is empty.',
    ].join('\n'),
  },
  shop: {
    title: 'Shop',
    description: [
      'A server shop. Stock `0` means unlimited. Roles are applied when someone uses the item, not when they buy it.',
      '',
      '`/shop add name:cookie price:10 stock:0 description:Have a cookie`',
      '`/shop edit-role item:cookie role:@Cookie` grants that role on `/shop use`.',
      '`/shop edit-requirerole` limits who can buy. `/shop edit-removerole` takes a role away on use.',
      '`/shop edit-reply` sets the message. `/shop edit-give disabled:True` blocks gifting.',
      '`/shop view` lists the shop. `/shop buy item:cookie amount:2` purchases it.',
      '`/shop inventory` shows what someone holds. Bought items stay if the shop listing changes.',
      '`/cashset confirm enabled:True` asks before a purchase. `/cashset ids enabled:True` shows item ids.',
    ].join('\n'),
  },
  cash: {
    title: 'Currency',
    description: [
      'Each server has its own balance. The symbol starts as 🍪.',
      '',
      '`/cash pet` and `/cash snuggle` pay a random amount on a cooldown. Mention someone to give them the earnings.',
      '`/cash clickcake` is a marshmallow you click within 8 seconds.',
      '`/cash coinflip`, `/cash dice`, and `/cash slots` take bets. Above 64, dice earns the amount you bet. Above 90 it earns 3×. A roll of 100 earns 9×.',
      '`/cash give` sends currency. `/cash give-item` sends a giftable item. `/cash drop` leaves some in the channel.',
      '`/cash event-start` posts a button that pays once per person.',
      '`/cashset symbol`, `/cashset pet`, and `/cashset pick-channel` are for Manage Server.',
      '`/cashset grant` and `/cashset take` change a balance. Resets need `confirm:True` when they cover the whole server.',
    ].join('\n'),
  },
  companion: {
    title: 'Companion',
    description: [
      '`/companion adopt name:Miso` starts a companion in this server, with happiness, food, stars, and a lifetime that passes in real time.',
      '`/companion play` and `/companion feed` are the daily care. Explore finds food. A stroll or a dream needs a stocked pantry.',
      '`/companion playdate`, `/companion cozy`, and `/companion activity` are shared. Visit, heal, stroll, dream, and manifest need another person.',
      'Each action waits 30 minutes. If their lifetime hits zero, they head off and you can adopt again.',
    ].join('\n'),
  },
  greet: {
    title: 'Greetings',
    description: [
      '`/greet message` and `/greet channel` welcome a new member.',
      '`/greet leave-message` and `/greet boost-message` cover goodbyes and boosts.',
      'Placeholders: `{user}`, `{user_name}`, `{server_name}`, `{server_membercount}`, `{newline}`, `{user_avatar}`, `{server_icon}`, and `{embed:name}` for a saved embed.',
      '`/greet preview kind:Welcome` shows it to you.',
    ].join('\n'),
  },
  autoresponder: {
    title: 'Autoresponder',
    description: [
      '`/autoresponder add trigger:hi reply:hello {user}`',
      'Match modes are contains, exact, and starts with. Exact wins when more than one could match.',
      'Replies can use the same placeholders as greetings, including `{embed:name}`.',
    ].join('\n'),
  },
  hotlines: {
    title: 'Hotlines',
    description: [
      '`/hotlines online` lists directories that cover more countries than this bot stores.',
      '`/hotlines search country:Canada` shows a checked line when one is on file.',
    ].join('\n'),
  },
  verify: {
    title: 'Verification',
    description: [
      'Give new people a hold role, then a verified role once they pass the gate. Hide the rest of the server from the hold role in channel settings. The bot only changes roles.',
      '',
      '`/verify setup role:@Verified hold:@Unverified phrase:I agree age:24`',
      'Leave the phrase empty, or set it to `-`, for a button with no typing. `age` is the minimum account age in hours. `0` turns that off.',
      '`/verify panel channel:#verify` posts the button. The phrase, if you set one, appears in the box they have to match.',
      '`/verify grant` verifies someone by hand and skips the account-age check. `/verify remove` takes the role back.',
      'Success and removals are written to the automod log, if one is set.',
    ].join('\n'),
  },
};

module.exports = {
  data: guildCommand('help', 'See what this bot can do.')
    .addStringOption((option) => option
      .setName('topic')
      .setDescription('One feature to read about')
      .addChoices(
        { name: 'Profile', value: 'profile' },
        { name: 'Reaction roles', value: 'roles' },
        { name: 'Polls', value: 'polls' },
        { name: 'Confessions', value: 'confessions' },
        { name: 'Embeds', value: 'embeds' },
        { name: 'System and proxy', value: 'system' },
        { name: 'Focus', value: 'focus' },
        { name: 'Tickets', value: 'tickets' },
        { name: 'Moderation', value: 'mod' },
        { name: 'Ambient', value: 'ambient' },
        { name: 'Shop', value: 'shop' },
        { name: 'Currency', value: 'cash' },
        { name: 'Companion', value: 'companion' },
        { name: 'Greetings', value: 'greet' },
        { name: 'Autoresponder', value: 'autoresponder' },
        { name: 'Hotlines', value: 'hotlines' },
        { name: 'Verification', value: 'verify' },
      )),

  async execute(interaction) {
    const topic = interaction.options.getString('topic');
    const embed = new EmbedBuilder().setColor(ACCENT);
    if (topic && TOPICS[topic]) {
      embed.setTitle(TOPICS[topic].title).setDescription(TOPICS[topic].description);
    } else {
      embed
        .setTitle('Commands')
        .setDescription('A server shop and currency, plus profiles, proxies, focus timers, tickets, moderation, roles, embeds, polls, and confessions.')
        .addFields(
          {
            name: 'Shop',
            value: 'Buy items, then use them for a role or a reply.\n`/shop add` · `/shop view` · `/shop buy` · `/shop use`',
          },
          {
            name: 'Currency',
            value: 'Pet, snuggle, gifts, drops, and bets.\n`/cash balance` · `/cash pet` · `/cash give` · `/cashset show`',
          },
          {
            name: 'Profile',
            value: 'A Carrd-style page: name, intro, bio, banner, and a stack of links.\n`/profile edit` · `/profile link-add` · `/profile view` · `/profile post`',
          },
          {
            name: 'Verification',
            value: 'A hold role until someone passes the gate.\n`/verify setup` · `/verify panel` · `/verify grant`',
          },
          {
            name: 'Reaction roles',
            value: 'Buttons or reactions that toggle a role.\n`/reactionrole panel` · `/reactionrole add`',
          },
          {
            name: 'Polls',
            value: '`/poll create question:Ship it? options:Yes | Not yet duration:2h`\n`/poll end` closes one.',
          },
          {
            name: 'Confessions',
            value: 'Anonymous posts, with an optional moderator review.\n`/confess setup` · `/confess send`',
          },
          {
            name: 'Embeds',
            value: 'Build a message once, then send it anywhere.\n`/embed create` · `/embed preview` · `/embed send`',
          },
          {
            name: 'System',
            value: 'Proxy with tags, and track who is fronting.\n`/system member-add` · `/system front` · `/system autoproxy`',
          },
          {
            name: 'Focus',
            value: 'A shared work sprint, or a one-line check-in.\n`/focus start` · `/focus checkin`',
          },
          {
            name: 'Tickets',
            value: 'A private channel with staff.\n`/ticket setup` · `/ticket panel`',
          },
          {
            name: 'Moderation',
            value: 'Cases, logs, invite and spam filters, lockdown.\n`/automod config` · `/mod warn`',
          },
        )
        .setFooter({ text: 'Use /help topic: to read one feature.' });
    }
    await interaction.reply({ embeds: [embed], flags: ephemeral().flags });
  },
};
