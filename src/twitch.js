export function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

export function userColor(login) {
  return `hsl(${hash(login.toLowerCase()) % 360} 82% 70%)`;
}

export function unescapeTag(value) {
  const escapes = { s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' };
  return value.replace(/\\(.)|\\$/gs, (_, char) => escapes[char] ?? char ?? '');
}

export function parseIRC(line) {
  if (!line.trim()) return null;
  let rest = line.replace(/\r$/, '');
  const tags = Object.create(null);
  let prefix = null;
  if (rest.startsWith('@')) {
    const end = rest.indexOf(' ');
    if (end < 0) return null;
    for (const tag of rest.slice(1, end).split(';')) {
      const index = tag.indexOf('=');
      tags[index < 0 ? tag : tag.slice(0, index)] = index < 0 ? '' : unescapeTag(tag.slice(index + 1));
    }
    rest = rest.slice(end + 1).trimStart();
  }
  if (rest.startsWith(':')) {
    const end = rest.indexOf(' ');
    if (end < 0) return null;
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1).trimStart();
  }
  const trailingIndex = rest.indexOf(' :');
  const trailing = trailingIndex < 0 ? null : rest.slice(trailingIndex + 2);
  const parts = (trailingIndex < 0 ? rest : rest.slice(0, trailingIndex)).split(/ +/);
  const command = parts.shift()?.toUpperCase();
  return command ? { tags, prefix, command, params: parts, trailing } : null;
}

export function parseFrame(frame) {
  return String(frame).split(/\r?\n/).map(parseIRC).filter(Boolean);
}

export function parseEmotes(value = '', text = '') {
  const length = Array.from(text).length;
  const emotes = [];
  for (const group of value.split('/')) {
    const [id, ranges] = group.split(':');
    if (!id || !ranges) continue;
    for (const range of ranges.split(',')) {
      if (!/^\d+-\d+$/.test(range)) continue;
      const [start, end] = range.split('-').map(Number);
      if (start <= end && end < length) emotes.push({ id, start, end });
    }
  }
  return emotes.sort((a, b) => a.start - b.start);
}

export function emoteText(text, emote) {
  return Array.from(text).slice(emote.start, emote.end + 1).join('');
}

export function isPing(message) {
  return message?.command === 'PING';
}

export function moderatorCommand(event) {
  if (event?.type !== 'chat' || !(event.badges.moderator || event.badges.broadcaster)) return null;
  const command = event.text.trim().toLowerCase();
  return command === '!rebuild' ? 'rebuild' : command === '!clear' ? 'clear' : null;
}

const positiveNumber = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function toEvent(message) {
  if (!message || !['PRIVMSG', 'USERNOTICE'].includes(message.command)) return null;
  const { tags, prefix, trailing } = message;
  const login = (tags.login || prefix?.split('!')[0] || 'anonymous').toLowerCase();
  const badgeNames = new Set((tags.badges || '').split(',').map(badge => badge.split('/')[0]));
  const event = {
    type: 'chat', user: tags['display-name'] || login, login,
    color: /^#[\da-f]{6}$/i.test(tags.color || '') ? tags.color : userColor(login),
    text: trailing ?? '', emotes: parseEmotes(tags.emotes, trailing ?? ''),
    badges: Object.fromEntries(['subscriber', 'moderator', 'broadcaster', 'vip'].map(name => [name, badgeNames.has(name)])),
    bits: positiveNumber(tags.bits), highlighted: tags['msg-id'] === 'highlighted-message',
    reward: tags['custom-reward-id'] || null, firstMsg: tags['first-msg'] === '1',
  };
  if (message.command === 'PRIVMSG') return event;
  switch (tags['msg-id']) {
    case 'sub': case 'resub': return { ...event, type: 'sub' };
    case 'subgift': case 'submysterygift':
      return { ...event, type: 'gift', count: positiveNumber(tags['msg-param-mass-gift-count']) || 1 };
    case 'raid': return { ...event, type: 'raid', user: tags['msg-param-displayName'] || event.user,
      login: tags['msg-param-login'] || login, viewerCount: positiveNumber(tags['msg-param-viewerCount']) };
    case 'announcement': return { ...event, type: 'announcement' };
    default: return null;
  }
}

export function connectTwitch(channel, onEvent, onStatus, options = {}) {
  const WebSocketClass = options.WebSocket ?? globalThis.WebSocket;
  const schedule = options.setTimeout ?? globalThis.setTimeout;
  const cancel = options.clearTimeout ?? globalThis.clearTimeout;
  let socket, timer, stopped = false, attempt = 0;
  function retry() {
    if (stopped || timer != null) return;
    onStatus('offline');
    timer = schedule(() => { timer = null; connect(); }, Math.min(30000, 1000 * 2 ** attempt++));
  }
  function connect() {
    if (stopped) return;
    onStatus('connecting');
    try { socket = new WebSocketClass('wss://irc-ws.chat.twitch.tv:443'); }
    catch { retry(); return; }
    socket.onopen = () => {
      for (const line of ['CAP REQ :twitch.tv/tags twitch.tv/commands', 'PASS SCHMOOPIIE',
        `NICK justinfan${Math.floor(10000 + Math.random() * 90000)}`, `JOIN #${channel}`]) socket.send(line + '\r\n');
    };
    socket.onmessage = ({ data }) => {
      for (const message of parseFrame(data)) {
        if (isPing(message)) socket.send(`PONG :${message.trailing ?? message.params.join(' ')}\r\n`);
        if (message.command === 'RECONNECT') { socket.close(); return; }
        if (message.command === 'ROOMSTATE' || message.command === '366') {
          attempt = 0;
          onStatus('connected');
        }
        const event = toEvent(message);
        if (event) onEvent(event);
      }
    };
    socket.onclose = retry;
    socket.onerror = () => socket.close();
  }
  connect();
  return () => {
    stopped = true;
    cancel(timer);
    if (socket) { socket.onclose = null; socket.onmessage = null; socket.onopen = null; socket.close(); }
  };
}
