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
