import { hash, userColor } from './twitch.js';

const adjectives = ['pixel', 'cozy', 'sleepy', 'tiny', 'crispy', 'lucky', 'chaos', 'mossy'];
const nouns = ['otter', 'toaster', 'frog', 'noodle', 'pigeon', 'bean', 'wizard', 'moth'];
const lines = ['brb getting snacks', 'one more brick', 'we got this', 'bonk', 'chat is this teamwork',
  'LET ME IN', 'the wall had it coming', 'cozy hours', 'just chatting :)', 'look at us go',
  'aiming for the B', 'hello hello', 'this is my lane', 'absolutely calculated', '♥', 'gg'];

export function chatter(name) {
  const user = name.trim().slice(0, 30) || 'pixel_otter';
  const login = user.toLowerCase();
  const value = hash(login);
  return { user, login, color: userColor(login), badges: { subscriber: value % 3 === 0,
    moderator: value % 11 === 0, broadcaster: false, vip: value % 7 === 0 } };
}

export class MockChat {
  constructor(onEvent, rate = 1.5, random = Math.random) {
    this.onEvent = onEvent;
    this.rate = rate;
    this.random = random;
    this.paused = false;
    this.wait = .3;
    this.people = Array.from({ length: 32 }, (_, i) => chatter(i === 0 ? 'NoScopeNana' :
      `${adjectives[i % adjectives.length]}_${nouns[Math.floor(i / adjectives.length) + i % 3]}${i % 4 === 0 ? 42 : ''}`));
    this.seen = new Set();
  }

  event(overrides = {}) {
    const person = this.people[Math.floor(this.random() * this.people.length)];
    return { ...person, type: 'chat', text: lines[Math.floor(this.random() * lines.length)],
      emotes: [], bits: 0, highlighted: false, reward: null, firstMsg: false, ...overrides };
  }

  send(text, name) { this.onEvent(this.event({ ...chatter(name), text })); }

  special(key) {
    const extras = {
      r: { type: 'raid', viewerCount: 40, ...chatter('cozy_campfire') },
      s: { type: 'sub' }, g: { type: 'gift', count: 5 }, b: { bits: 500 },
      h: { highlighted: true, text: 'THIS ONE IS FOR CHAT' },
    };
    if (extras[key]) this.onEvent(this.event(extras[key]));
  }

  update(dt) {
    if (this.paused || this.rate <= 0) return;
    this.wait -= dt;
    while (this.wait <= 0) {
      const event = this.event();
      if (this.random() < .35) event.mockFace = true;
      if (!this.seen.has(event.login)) { event.firstMsg = true; this.seen.add(event.login); }
      this.onEvent(event);
      this.wait += (.6 + this.random() * .8) / this.rate;
    }
  }
}
