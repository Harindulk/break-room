import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIRC, parseFrame, toEvent, isPing, userColor, emoteText, moderatorCommand,
  connectTwitch, unescapeTag } from '../src/twitch.js';

const chat = (tags = '', text = 'hello') => toEvent(parseIRC(`@${tags} :alice!alice@alice.tmi.twitch.tv PRIVMSG #room :${text}`));
const notice = (id, tags = '') => toEvent(parseIRC(`@login=alice;display-name=Alice;msg-id=${id};${tags} :tmi.twitch.tv USERNOTICE #room :great stream`));

test('IRCv3 escapes, prefix, params and trailing text', () => {
  const result = parseIRC(String.raw`@label=one\stwo\:three\\four\r\nfive;empty=;flag :a!a@host PRIVMSG #room :hi :there`);
  assert.equal(result.tags.label, 'one two;three\\four\r\nfive');
  assert.equal(result.tags.empty, '');
  assert.equal(result.tags.flag, '');
  assert.equal(result.prefix, 'a!a@host');
  assert.equal(result.command, 'PRIVMSG');
  assert.deepEqual(result.params, ['#room']);
  assert.equal(result.trailing, 'hi :there');
  assert.equal(parseIRC('PRIVMSG #room :hi  ').trailing, 'hi  ');
  assert.equal(unescapeTag('a\\qz\\'), 'aqz');
});

test('PRIVMSG tags, badges, bits, reward and sorted emotes', () => {
  const event = chat('display-name=Alice;badges=subscriber/12,moderator/1,vip/1;color=#12AB34;bits=500;first-msg=1;custom-reward-id=reward;msg-id=highlighted-message;emotes=25:6-10/88:0-4', 'Kappa Kappa');
  assert.equal(event.type, 'chat');
  assert.equal(event.user, 'Alice');
  assert.equal(event.login, 'alice');
  assert.equal(event.color, '#12AB34');
  assert.equal(event.bits, 500);
  assert.equal(event.highlighted, true);
  assert.equal(event.firstMsg, true);
  assert.equal(event.reward, 'reward');
  assert.deepEqual(event.badges, { subscriber: true, moderator: true, broadcaster: false, vip: true });
  assert.deepEqual(event.emotes, [{ id: '88', start: 0, end: 4 }, { id: '25', start: 6, end: 10 }]);
});

test('emote positions count code points after emoji, not UTF-16 units', () => {
  const event = chat('emotes=25:2-6,8-12', '😀 Kappa Kappa');
  assert.deepEqual(event.emotes, [{ id: '25', start: 2, end: 6 }, { id: '25', start: 8, end: 12 }]);
  assert.equal(emoteText(event.text, event.emotes[0]), 'Kappa');
  assert.equal(emoteText(event.text, event.emotes[1]), 'Kappa');
  assert.deepEqual(chat('emotes=25:99-120,bad').emotes, []);
});

test('frames contain multiple lines and blank lines are ignored', () => {
  const messages = parseFrame('PING :tmi.twitch.tv\r\n:alice!a@host PRIVMSG #room :hey\r\n\r\n');
  assert.equal(messages.length, 2);
  assert.equal(isPing(messages[0]), true);
  assert.equal(messages[0].trailing, 'tmi.twitch.tv');
  assert.equal(isPing(messages[1]), false);
  assert.equal(toEvent(messages[1]).text, 'hey');
});

test('USERNOTICE sub, resub, gift, mystery gift, raid and announcement mapping', () => {
  assert.equal(notice('sub').type, 'sub');
  assert.equal(notice('resub').type, 'sub');
  assert.equal(notice('subgift').count, 1);
  assert.equal(notice('subgift').type, 'gift');
  assert.equal(notice('submysterygift', 'msg-param-mass-gift-count=5').count, 5);
  const raid = notice('raid', 'msg-param-viewerCount=40;msg-param-displayName=CozyCrew;msg-param-login=cozycrew');
  assert.equal(raid.type, 'raid');
  assert.equal(raid.viewerCount, 40);
  assert.equal(raid.user, 'CozyCrew');
  assert.equal(raid.login, 'cozycrew');
  assert.equal(notice('announcement').text, 'great stream');
  assert.equal(notice('announcement').type, 'announcement');
  assert.equal(notice('ritual'), null);
});

test('missing colour is bright and stable by login', () => {
  assert.equal(chat('').color, userColor('alice'));
  assert.equal(userColor('Alice'), userColor('alice'));
  assert.match(chat('color=').color, /^hsl\(\d+ 82% 70%\)$/);
  assert.notEqual(userColor('alice'), userColor('bob'));
});

test('only moderator or broadcaster badges authorize exact, case-insensitive commands', () => {
  assert.equal(moderatorCommand(chat('badges=moderator/1', '!ReBuIlD')), 'rebuild');
  assert.equal(moderatorCommand(chat('badges=broadcaster/1', ' !CLEAR ')), 'clear');
  assert.equal(moderatorCommand(chat('badges=subscriber/1,vip/1', '!rebuild')), null);
  assert.equal(moderatorCommand(chat('mod=1', '!clear')), null);
  assert.equal(moderatorCommand(chat('badges=moderator/1', '!clear please')), null);
  assert.equal(moderatorCommand(chat('badges=moderator/1', '!hello')), null);
  assert.equal(moderatorCommand(notice('announcement')), null);
});

test('moderation messages and malformed lines do not launch balls', () => {
  assert.equal(toEvent(parseIRC(':tmi.twitch.tv CLEARCHAT #room :alice')), null);
  assert.equal(toEvent(parseIRC('@login=alice :tmi.twitch.tv CLEARMSG #room :hello')), null);
  assert.equal(parseIRC(''), null);
  assert.equal(parseIRC('@broken'), null);
  assert.equal(parseIRC(':broken'), null);
});

test('anonymous socket handshake, PONG, backoff, RECONNECT and cleanup', () => {
  const sockets = [], pending = [], statuses = [], events = [];
  class Socket {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this); }
    send(line) { this.sent.push(line); }
    close() { this.onclose?.(); }
  }
  const stop = connectTwitch('room', event => events.push(event), status => statuses.push(status), {
    WebSocket: Socket, setTimeout: (fn, delay) => { pending.push({ fn, delay }); return pending.length; }, clearTimeout: () => {},
  });
  const socket = sockets[0];
  assert.equal(socket.url, 'wss://irc-ws.chat.twitch.tv:443');
  socket.onopen();
  assert.deepEqual(socket.sent.slice(0, 2), ['CAP REQ :twitch.tv/tags twitch.tv/commands\r\n', 'PASS SCHMOOPIIE\r\n']);
  assert.match(socket.sent[2], /^NICK justinfan\d{5}\r\n$/);
  assert.equal(socket.sent[3], 'JOIN #room\r\n');
  socket.onmessage({ data: 'PING :tmi.twitch.tv\r\n:alice!a@h PRIVMSG #room :hi\r\n' });
  assert.equal(socket.sent[4], 'PONG :tmi.twitch.tv\r\n');
  assert.equal(events.length, 1);
  socket.close();
  assert.equal(pending[0].delay, 1000);
  for (let i = 0; i < 6; i++) { pending[i].fn(); sockets.at(-1).close(); }
  assert.deepEqual(pending.map(item => item.delay), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  pending.at(-1).fn();
  sockets.at(-1).onmessage({ data: ':tmi.twitch.tv ROOMSTATE #room\r\nRECONNECT\r\n' });
  assert.ok(statuses.includes('connected'));
  assert.equal(pending.at(-1).delay, 1000);
  stop();
  const count = sockets.length;
  pending.at(-1).fn();
  assert.equal(sockets.length, count);
});
