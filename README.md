# 0gbot

A Discord bot for a small community: a server shop and currency, Carrd-style profiles, headmate proxying, shared focus timers, private tickets, moderation logs, reaction roles, embeds, polls, and anonymous confessions.

## Setup

You need Node.js 20. Pella’s Node 20.20.2 is enough. The database uses `node-sqlite3-wasm`, which runs on that version.

1. Create an application at <https://discord.com/developers/applications>.
2. Open **Bot** and reset the token. Turn on the **Message Content** and **Server Members** intents. Proxying, automod, and edit logs need Message Content. Join alerts, welcome messages, and starting currency need Server Members.
3. Copy `.env.example` to `.env`. Set `DISCORD_TOKEN` and `CLIENT_ID`. Set `GUILD_ID` while testing so commands show up immediately.
4. Invite the bot. Replace `CLIENT_ID`:

   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=1409558080598&scope=bot%20applications.commands`

5. Install, register commands, and start:

```bash
npm install
npm run deploy
npm start
```

`/help` lists everything. `/help topic:` explains one feature.

Move the bot's role above every role it should assign or moderate.

## What it stores

Data lives in `data/0gbot.sqlite`.

- System profiles, tags, and who is fronting are stored per server. Proxied message text is not stored.
- Confession authors are stored. A confession log, if you set one, also records the name. Public posts do not.
- Mod cases, ticket transcripts, and deleted-message logs go to the automod log channel. Keep that channel staff-only.
- Profile pages follow a person across servers that share this bot.
- Balances, shop stock, inventories, and companions belong to one server.

## Commands

| Command | What it does |
| --- | --- |
| `/system member-add` | Add a headmate and a proxy tag such as `jay:` |
| `/system front` | Record who is fronting |
| `/system autoproxy` | Proxy untagged messages while fronting, or stick with the last speaker |
| `/focus start` | Shared work/break sprint in the channel |
| `/focus checkin` | A one-line intention with a Done button |
| `/ticket setup` | Category and staff role for private tickets |
| `/ticket panel` | Button that opens a ticket |
| `/automod config` | Log channel, invite filter, spam filter, join alert |
| `/automod lockdown` | Slowmode on channels that had none |
| `/mod warn` | Warning, timeout, kick, ban, and case history |
| `/ambient join` | Quiet generated noise in your voice channel |
| `/reactionrole panel` | Buttons or reactions for pronouns, pings, or channel access |
| `/reactionrole preset` | Neurotype, pronoun, or comms panel. Each reaction toggles its role |
| `/embed create` | Save an embed and send it later |
| `/embed preset` | Save the rules, sector map, welcome, or goodbye |
| `/greet leave-message` | Goodbye when someone leaves. `{username}` is their name in lowercase |
| `/profile edit` | Carrd-style page |
| `/poll create` | A poll |
| `/confess setup` | Anonymous confessions |
| `/shop add` | Add a shop item. Stock `0` is unlimited. Roles apply on `/shop use` |
| `/shop buy` | Buy an item into your inventory |
| `/cash pet` | Earn currency, or `/cash give`, `/cash drop`, and `/cash slots` |
| `/cashset show` | Symbol, payouts, drop channels, and resets |
| `/companion adopt` | A companion with food, happiness, and a lifetime |
| `/greet message` | Welcome, goodbye, and boost text, with `{embed:name}` |
| `/autoresponder add` | Reply when a message matches a phrase |
| `/hotlines online` | Crisis-line directories |
| `/verify setup` | Verified role, optional hold role, phrase, and account age |
| `/verify panel` | Button that grants the verified role |

For a private channel, create the role, hide the channel from everyone, allow that role to see it, then add the role to a reaction-role panel. The bot toggles the role. You set the channel permissions.

Ambient audio is generated noise, not a music bot. `/ambient leave` stops it, and it also leaves when the voice channel is empty.
