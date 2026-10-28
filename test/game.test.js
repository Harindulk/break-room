import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STEP } from '../src/game.js';
import { layoutText, normalizeText } from '../src/font.js';
import { chatter, MockChat } from '../src/mock.js';
import { createAudio } from '../src/audio.js';

const event = (overrides = {}) => ({ ...chatter('pixel_otter'), type: 'chat', text: 'hello',
  emotes: [], firstMsg: false, bits: 0, ...overrides });
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) game.update(STEP); };

test('font supports every requested character, two lines, heart aliases, and skips unknowns', () => {
  for (const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?. ,'-:♥".replaceAll(' ', '')) assert.ok(layoutText(char).length > 0, char);
  assert.deepEqual(normalizeText('brb|5 min|extra'), ['BRB', '5 MIN']);
  assert.deepEqual(normalizeText('😀hi❤\uFE0F'), ['HI♥']);
  assert.deepEqual(normalizeText('😀'), ['BE RIGHT BACK']);
  const bricks = layoutText('BE RIGHT BACK|BACK SOON ♥');
  assert.ok(bricks.every(brick => brick.x >= 0 && brick.x + brick.w <= 1920 && brick.y > 270 && brick.y + brick.h < 648));
  const o = layoutText('O');
  assert.equal(o.length, 16);
});

test('normal chat has a stable lane, bounded angle, speed and message size', () => {
  const game = new Game({ random: () => .75 });
  game.receive(event()); game.receive(event({ text: '!unrecognized' }));
  const [first, second] = game.balls;
  assert.equal(first.x, second.x);
  assert.ok(Math.abs(Math.atan2(first.vx, -first.vy)) <= Math.PI / 6);
  assert.ok(Math.abs(Math.hypot(first.vx, first.vy) - 900) < .001);
  game.receive(event({ text: 'a'.repeat(500) }));
  assert.equal(game.balls.at(-1).r, 13 * 1.3);
  game.receive(event({ text: '', emotes: [{ id: '25' }] }));
  assert.equal(game.balls.at(-1).r, 13 * 1.5);
});

test('subscriber fan, gifts, cheer cap, highlight, redemption and first message', () => {
  const game = new Game();
  game.receive(event({ type: 'sub' }));
  assert.equal(game.balls.length, 5);
  assert.ok(game.balls.every(ball => ball.color === '#ffd56b'));
  assert.equal(new Set(game.balls.map(ball => ball.vx)).size, 5);
  game.receive(event({ type: 'gift', count: 100 }));
  assert.equal(game.balls.length, 55);
  game.receive(event({ bits: 500, mockFace: true }));
  assert.equal(game.balls.at(-1).heavy, true);
  assert.equal(game.balls.at(-1).budget, 35);
  game.receive(event({ bits: 10000, text: 'a'.repeat(500) }));
  assert.equal(game.balls.at(-1).r, 13 * 4);
  game.receive(event({ highlighted: true, text: '' }));
  assert.equal(game.balls.at(-1).r, 13 * 3);
  game.receive(event({ reward: 'reward', text: 'hi' }));
  assert.ok(game.balls.at(-1).r >= 13 * 3);
  game.receive(event({ firstMsg: true }));
  assert.equal(game.balls.at(-1).first, true);
});

test('raid is a left-to-right two-second wave capped at 80; announcements launch nothing', () => {
  const game = new Game({ reducedMotion: true });
  game.receive(event({ type: 'raid', viewerCount: 200 }));
  assert.equal(game.pending.length, 80);
  assert.equal(game.balls.length, 0);
  assert.ok(game.pending[0].extra.x < game.pending.at(-1).extra.x);
  assert.equal(game.pending.at(-1).delay, 2);
  assert.equal(game.shake, 0);
  advance(game, 1);
  assert.ok(game.launched >= 39 && game.launched <= 41);
  advance(game, 1.1);
  assert.equal(game.launched, 80);
  const launched = game.launched;
  game.receive(event({ type: 'announcement', text: 'hello crew' }));
  assert.equal(game.launched, launched);
  assert.equal(game.banners.at(-1).title, 'hello crew');
});

test('collision destroys a brick, reflects on the contact axis, and credits its owner', () => {
  const game = new Game({ text: 'I' });
  game.receive(event());
  const brick = game.bricks.at(-1), ball = game.balls[0], remaining = game.remaining;
  ball.x = brick.x + brick.w / 2;
  ball.y = brick.y + brick.h + ball.r - 1;
  ball.vx = 0; ball.vy = -900;
  game.collide(ball);
  assert.equal(game.remaining, remaining - 1);
  assert.equal(ball.vy, 900);
  assert.equal(game.leaders()[0].score, 1);
  assert.ok(game.particles.length > 0);
});

test('heavy balls penetrate, hit each crossed brick once, and expire at destruction budget', () => {
  const game = new Game({ text: 'I' });
  game.receive(event({ bits: 500 }));
  const ball = game.balls[0], brick = game.bricks.at(-1);
  ball.x = brick.x + brick.w / 2; ball.y = brick.y + brick.h / 2;
  ball.r = 5; ball.vy = -900; brick.hp = 3;
  game.collide(ball); game.collide(ball);
  assert.equal(brick.hp, 2);
  assert.equal(ball.vy, -900);
  assert.equal(ball.budget, 35);
  ball.x = 10; ball.y = 900; game.collide(ball);
  ball.x = brick.x + brick.w / 2; ball.y = brick.y + brick.h / 2;
  game.collide(ball);
  assert.equal(brick.hp, 1, 'a later pass can hit the same surviving brick again');
  ball.budget = 1;
  const next = game.bricks[0];
  ball.x = next.x + next.w / 2; ball.y = next.y + next.h / 2;
  game.collide(ball);
  assert.equal(ball.dead, true);
});

test('top and side edges bounce; falling balls and 14-second-old balls expire', () => {
  const game = new Game();
  game.receive(event());
  const ball = game.balls[0];
  ball.x = 0; ball.y = 800; ball.vx = -900; ball.vy = 0;
  game.update(STEP); assert.ok(ball.vx > 0); assert.ok(ball.squash > 0);
  ball.x = 900; ball.y = 0; ball.vx = 0; ball.vy = -900;
  game.update(STEP); assert.ok(ball.vy > 0);
  ball.y = 1200; game.update(STEP); assert.equal(game.balls.length, 0);
  game.receive(event()); game.balls[0].age = 13.999; game.hitStop = .03;
  game.update(STEP); assert.equal(game.balls.length, 0);
});

test('win freezes results, lasts 0.6s plus a 10s card, then rebuilds tougher', () => {
  const game = new Game();
  game.receive(event()); advance(game, 2);
  game.wipe();
  const result = game.win;
  assert.equal(game.remaining, 0);
  assert.equal(result.launched, 1);
  assert.ok(Math.abs(result.elapsed - 2) < .001);
  game.receive(event()); assert.equal(game.launched, 1);
  advance(game, 10.5); assert.equal(game.level, 1);
  advance(game, .2); assert.equal(game.level, 2);
  assert.equal(game.win, null);
  assert.equal(game.launched, 0);
  assert.ok(game.bricks.some(brick => brick.hp === 2));
  assert.ok(game.bricks.some(brick => brick.hp === 1));
  assert.equal(game.bricks.filter(brick => brick.hp === 2).length, Math.round(game.total * .3));
  for (let i = 0; i < 20; i++) game.rebuild();
  assert.ok(game.bricks.every(brick => brick.hp === 3));
});

test('last actual collision wins with the final point included', () => {
  const game = new Game();
  game.receive(event());
  game.bricks.slice(1).forEach(brick => brick.hp = 0);
  game.remaining = 1;
  const brick = game.bricks[0], ball = game.balls[0];
  ball.x = brick.x + brick.w / 2; ball.y = brick.y + brick.h + ball.r - 1;
  game.collide(ball);
  assert.equal(game.win.leaders[0].score, 1);
});

test('moderation commands can clear queued raids or rebuild during a win', () => {
  const game = new Game();
  game.receive(event({ type: 'raid', viewerCount: 40 }));
  game.receive(event({ text: '!clear', badges: { moderator: false } }));
  assert.equal(game.balls.length, 1);
  game.receive(event({ text: '!clear', badges: { moderator: true } }));
  assert.equal(game.balls.length, 0); assert.equal(game.pending.length, 0);
  game.wipe(); game.receive(event({ text: '!REBUILD', badges: { broadcaster: true } }));
  assert.equal(game.win, null); assert.equal(game.level, 2); assert.ok(game.remaining > 0);
});

test('mock chat pause, chosen names, rate and all special shortcuts', () => {
  const events = [], mock = new MockChat(event => events.push(event), 2, () => .5);
  mock.update(2); assert.equal(events.length, 4);
  mock.paused = true; mock.update(10); assert.equal(events.length, 4);
  mock.send('hello', 'ChosenName'); assert.equal(events.at(-1).user, 'ChosenName');
  for (const key of ['r', 's', 'g', 'b', 'h']) mock.special(key);
  assert.deepEqual(events.slice(-5).map(event => event.type), ['raid', 'sub', 'gift', 'chat', 'chat']);
  assert.equal(events.at(-2).bits, 500); assert.equal(events.at(-1).highlighted, true);
});

test('silent mode does not create an AudioContext', () => {
  const sound = createAudio(false);
  assert.doesNotThrow(() => { sound.unlock(); sound.play('win'); });
});
