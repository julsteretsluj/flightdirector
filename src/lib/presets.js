'use strict';

const NIGHT = 0x5e7c99;

const rules = {
  title: '📜 0g flight manual — server rules',
  description: 'welcome aboard **0g (zero gravity)**. these guidelines keep our orbit sensory-safe, low-pressure, and welcoming for neurodivergent minds.',
  color: NIGHT,
  footer: { text: '0g · sensory-safe, low-pressure' },
  fields: [
    {
      name: '1. respect & neuro-affirming space',
      value: [
        '• treat everyone with kindness, patience, and good faith.',
        '• **no diagnosis gatekeeping.** formal medical diagnoses are not required. self-identification, questioning, and allies are all welcome.',
        '• respect communication boundaries, including dm preferences (`dms open`, `ask before dming`, `dms closed`) and tone indicators.',
      ].join('\n'),
    },
    {
      name: '2. tone indicators & clear communication',
      value: [
        '• tone tags like `/j` (joking), `/gen` (genuine), `/lh` (lighthearted), and `/srs` (serious) are encouraged. they help prevent text misunderstandings.',
        '• ask clarifying questions directly and generously rather than assuming hostility or sarcasm.',
      ].join('\n'),
    },
    {
      name: '3. sensory safety & content warnings',
      value: [
        '• use spoiler tags (`||like this||`) and a content warning before flashing gifs, loud or sudden videos, medical topics, or heavy emotional themes.',
        '• keep heavy venting in **#🖤・black-hole**. that channel needs the opt-in role, so members with low spoons are not caught off guard.',
        '• skip `@everyone` and `@here` unless the update is urgent for the whole server. use opt-in ping roles instead.',
      ].join('\n'),
    },
    {
      name: '4. unmasking, infodumping & low-energy etiquette',
      value: [
        '• infodumping is celebrated in **#📡・infodump-relay**. long messages and deep dives into special interests need no apology.',
        '• low-energy days are valid. short replies, emoji reactions, or quiet parallel presence in **#🌑・low-gravity** or **🤫・silent pod** are welcome.',
        '• delayed replies and silence are not personal. executive dysfunction, burnout, and time zones happen.',
      ].join('\n'),
    },
    {
      name: '5. safety & moderation',
      value: [
        '• follow discord\'s terms of service and community guidelines.',
        '• zero tolerance for hate speech, harassment, slurs, and bullying.',
        '• keep nsfw and explicit content out of the server.',
        '• if something feels off, or you need a moderator, use **#📬・control-tower** or modmail.',
      ].join('\n'),
    },
  ],
};

const map = {
  title: '🗺️ 0g (zero gravity) — sector & channel map',
  description: 'you don\'t need to visit every sector. float wherever matches your energy and interests today.',
  color: NIGHT,
  footer: { text: '0g · float where your energy is' },
  fields: [
    {
      name: '🛸 mission control',
      value: [
        '#🚀・launch-pad — welcome overview and quick-start guide',
        '#📜・flight-manual — rules, tone tags, and sensory boundaries',
        '#🛰️・transmissions — server announcements and updates',
        '#🪪・crew-manifest — self-assignable roles, pronouns, and opt-in access',
        '#🧑‍🚀・boarding-pass — optional introductions, with a copy-paste template pinned',
        '#📬・control-tower — feedback, suggestions, and private mod tickets',
      ].join('\n'),
    },
    {
      name: '🌌 the orbit',
      value: [
        '#🪐・main-deck — everyday chat and general hangout',
        '#🌑・low-gravity — low-energy lounge, emojis, and parallel presence',
        '#☄️・cosmic-crumbs — memes, clips, and internet finds',
        '#🐾・space-pets — pets, comfort photos, and wholesome content',
        '#📸・star-snapshots — selfies, outfits, rooms, and sensory setups',
        '#💬・cosmic-polls — low-stakes polls and icebreakers',
      ].join('\n'),
    },
    {
      name: '🔭 nebula lounge',
      value: [
        '#✨・starlight-wins — daily victories, big or small',
        '#🖤・black-hole — opt-in vent and support space (role required)',
        '#🧭・navigation-tools — nd life hacks, planners, and executive function tips',
        '#🧸・sensory-bay — stims, weighted blankets, noise-canceling, and sensory recs',
        '#⏳・orbit-together — text body doubling, task lists, and pomodoro timers',
        '#💼・career-nebula — work, school, accommodations, burnout, and finances',
        '#🩺・med-bay — opt-in meds, diagnosis journeys, therapy, and health (role required)',
      ].join('\n'),
    },
    {
      name: '🌠 deep space',
      value: [
        '#📡・infodump-relay — unfiltered hyperfixation deep-dives',
        '#🔬・science-and-cosmos — space, biology, psychology, and stem',
        '#🏛️・time-capsule — history, mythology, archaeology, and rabbit holes',
        '#🌿・terraforming — plants, gardening, nature, and weather',
        '#🍳・space-rations — safe foods, easy recipes, and special diets',
        '#👗・spacesuits — fashion, alt style, thrifting, makeup, and comfy clothes',
      ].join('\n'),
    },
    {
      name: '🎨 creative nebula',
      value: [
        '#🖌️・constellations — drawing, painting, digital art, and character design',
        '#🧶・craft-module — crochet, knitting, sewing, cosplay, and diy',
        '#✍️・star-logs — writing, poetry, worldbuilding, and fanfiction',
        '#🎵・soundwaves — music, playlists, instruments, and audio',
      ].join('\n'),
    },
    {
      name: '🕹️ entertainment deck',
      value: [
        '#🎮・arcade-module — video games, cozy games, and indie titles',
        '#🎲・tabletop-orbit — d&d, ttrpgs, board games, and card games',
        '#📚・library-vault — books, comics, manga, and audiobooks',
        '#🎬・holodeck — movies, tv shows, anime, and video essays',
        '#💻・tech-core — coding, pc builds, keyboards, and gadgets',
      ].join('\n'),
    },
    {
      name: '🎧 comms & pods',
      value: [
        '🎙️・galactic lounge — casual voice chat',
        '🤫・silent pod — muted, cameras-optional body doubling and co-working',
        '🎮・co-op bay — multiplayer gaming voice',
        '🍿・holodeck theater — screen-sharing for watch parties and movie nights',
        '🎵・ambient orbit — lo-fi and space ambiance',
      ].join('\n'),
    },
  ],
};

const welcome = {
  title: '🛸 Welcome to 0G (Zero Gravity), {user}!',
  description: [
    'Step out of heavy gravity and float in at your own pace—whether you\'re here to infodump, body-double, or hang out low-key.',
    '',
    '• **Rules & Boundaries:** `#📜・flight-manual`',
    '• **Roles & Opt-In Spaces:** `#🪪・crew-manifest`',
    '• **Optional Intros:** `#🧑‍🚀・boarding-pass` *(zero pressure!)*',
    '• **Low-Energy Space:** `#🌑・low-gravity`',
    '',
    'Need help or have a question? Reach out in `#📬・control-tower`.',
  ].join('\n'),
  color: NIGHT,
  footer: { text: '0g · arrive at your own pace' },
};

const presets = { rules, map, welcome };

function presetPayload(name) {
  const preset = presets[name];
  if (!preset) return null;
  return JSON.parse(JSON.stringify(preset));
}

function payloadLength(payload) {
  let total = (payload.title || '').length + (payload.description || '').length;
  total += payload.footer?.text?.length || 0;
  total += payload.author?.name?.length || 0;
  for (const field of payload.fields || []) total += field.name.length + field.value.length;
  return total;
}

module.exports = { presets, presetPayload, payloadLength };
