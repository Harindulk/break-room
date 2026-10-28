import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/render.js';

test('event banners pop, remain big and fully opaque, then fade; reduced motion stays still', () => {
  const renderer = Object.create(Renderer.prototype);
  let scale, panels, labels;
  renderer.ctx = { globalAlpha: .1, save() {}, restore() {}, translate() {}, scale(x) { scale = x; } };
  renderer.fit = text => text;
  renderer.box = (...args) => panels.push({ args, alpha: renderer.ctx.globalAlpha });
  renderer.text = (...args) => labels.push({ args, alpha: renderer.ctx.globalAlpha });
  function draw(age, reduced = false) {
    panels = []; labels = [];
    renderer.drawBanner({ title: 'RAID! cozy_campfire + 40', subtitle: 'THE WHOLE CREW IS HERE', color: '#91ffd4', age }, reduced);
  }
  draw(.2); assert.ok(scale > 1, 'the entrance overshoots');
  for (const age of [.4, 1, 2.2, 3.1]) {
    draw(age);
    assert.equal(scale, 1);
    assert.equal(panels[0].alpha, 1);
    assert.equal(panels[0].args[4], '#91ffd4');
    assert.ok(labels[0].args[3] >= 60);
    assert.ok(labels.every(label => label.alpha === 1));
  }
  draw(3.6); assert.ok(panels[0].alpha > 0 && panels[0].alpha < 1);
  draw(4); assert.equal(panels[0].alpha, 0);
  draw(.2, true); assert.equal(scale, 1); assert.equal(panels[0].alpha, 1);
});

test('all HUD elements draw above balls and particles, with banners and win cards last', () => {
  const renderer = Object.create(Renderer.prototype), calls = [];
  renderer.ctx = { clearRect() {}, save() {}, restore() {}, translate() {} };
  renderer.fit = text => text;
  renderer.text = text => calls.push(text);
  renderer.box = (x, y, w, h, color) => calls.push(color === 'particle' ? 'particle' : x === 760 && y === 882 ? 'progress' : 'panel');
  renderer.ball = () => calls.push('ball / trail / name');
  renderer.drawBanner = () => calls.push('banner');
  renderer.win = () => calls.push('win card');
  const game = { level: 1, remaining: 0, total: 1, elapsed: 7, launched: 1, bricks: [], balls: [{}],
    particles: [{ x: 0, y: 0, size: 3, color: 'particle', age: 0, life: 1 }], banners: [{}], leaders: () => [] };
  for (const ui of [true, false]) {
    renderer.options = { ui };
    calls.length = 0;
    renderer.draw(game, 'mock', { rate: 1.5 }, 123);
    const hud = ['BREAK ROOM', 'ROUND 01  /  0 BRICKS LEFT', 'YOUR CHAT. YOUR WRECKING CREW.',
      'Every message launches a ball. Talk the wall down.', 'progress', '0:07 ELAPSED  ·  1 BALLS LAUNCHED', 'BACK IN 2:03'];
    if (ui) hud.push('MOCK CHAT · LIVE DEMO', 'BRICK BREAKERS', 'THE DEMO DESK');
    assert.ok(calls.indexOf('particle') > calls.indexOf('ball / trail / name'));
    for (const label of hud) assert.ok(calls.indexOf(label) > calls.indexOf('particle'), label);
    assert.equal(calls.at(-1), 'banner');
  }
  game.win = { age: 1 };
  calls.length = 0;
  renderer.draw(game, 'mock', null, 123);
  assert.ok(calls.indexOf('ROUND 01  /  0 BRICKS LEFT') > calls.indexOf('particle'));
  assert.equal(calls.at(-1), 'win card');
});
