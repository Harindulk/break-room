import { connectTwitch } from './twitch.js';
import { MockChat } from './mock.js';
import { Game, STEP } from './game.js';
import { Renderer } from './render.js';
import { createAudio } from './audio.js';
import { setupPage } from './setup.js';

const params = new URLSearchParams(location.search);
const channel = (params.get('channel') || '').trim().replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
const mockEnabled = params.get('mock') === '1';
const number = (name, fallback, min, max) => {
  if (!params.has(name) || params.get(name) === '') return fallback;
  const value = Number(params.get(name));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

if (!channel && !mockEnabled) setupPage();
else {
  document.querySelector('#overlay').hidden = false;
  const options = { channel, text: params.get('text') || 'BE RIGHT BACK', bg: params.get('bg') === '1',
    ui: params.get('ui') !== '0' };
  const sound = createAudio(params.get('sound') === '1');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const game = new Game({ ...options, sound: sound.play, reducedMotion: motion.matches });
  const renderer = new Renderer(document.querySelector('#game'), options);
  const mock = mockEnabled ? new MockChat(event => game.receive(event), number('rate', 1.5, 0, 100)) : null;
  const back = number('back', null, 0, 1440);
  let elapsed = 0, accumulator = 0, last = performance.now(), status = channel ? 'connecting' : 'mock';
  let controlled = false;
  const disconnect = channel ? connectTwitch(channel, event => game.receive(event), value => status = value) : () => {};
  motion.addEventListener('change', event => { game.reducedMotion = event.matches; if (event.matches) game.shake = 0; });
  sound.unlock();
  addEventListener('pointerdown', sound.unlock);
  addEventListener('pagehide', disconnect, { once: true });

  const presenter = document.querySelector('#presenter');
  function closePresenter() { presenter.hidden = true; document.activeElement?.blur(); }
  document.querySelector('#close-presenter').addEventListener('click', closePresenter);
  presenter.addEventListener('submit', event => {
    event.preventDefault();
    mock?.send(document.querySelector('#presenter-message').value, document.querySelector('#presenter-name').value);
    document.querySelector('#presenter-message').value = '';
    document.querySelector('#presenter-message').focus();
  });
  addEventListener('keydown', event => {
    sound.unlock();
    if (event.key === 'Escape') closePresenter();
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'f') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    }
    if (!mock) return;
    if (key === ' ') { event.preventDefault(); mock.paused = !mock.paused; }
    else if (key === '+' || key === '=') mock.rate = Math.min(100, mock.rate + .5);
    else if (key === '-' || key === '_') mock.rate = Math.max(0, mock.rate - .5);
    else if (key === 'w') game.wipe();
    else if (key === 't') {
      presenter.hidden = !presenter.hidden;
      if (!presenter.hidden) { event.preventDefault(); document.querySelector('#presenter-message').focus(); }
    } else mock.special(key);
  });

  function tick(dt) {
    elapsed += dt;
    mock?.update(dt);
    game.update(dt);
  }
  function draw() { renderer.draw(game, status, mock, back === null ? null : back * 60 - elapsed); }
  function loop(now) {
    if (!controlled) {
      const dt = Math.max(0, (now - last) / 1000);
      // Keep the return countdown honest after a hidden tab, without a physics catch-up spiral.
      elapsed += Math.max(0, dt - .1);
      accumulator += Math.min(.1, dt);
      while (accumulator >= STEP) { tick(STEP); accumulator -= STEP; }
      draw();
    }
    last = now;
    requestAnimationFrame(loop);
  }
  window.advanceTime = ms => {
    controlled = true;
    const steps = Math.max(0, Math.round(ms / (STEP * 1000)));
    for (let i = 0; i < steps; i++) tick(STEP);
    draw();
  };
  window.render_game_to_text = () => JSON.stringify({ ...game.snapshot(), status,
    mock: mock ? { paused: mock.paused, rate: mock.rate } : null,
    countdown: back === null ? null : Math.max(0, back * 60 - elapsed),
    reducedMotion: game.reducedMotion, ui: options.ui, backdrop: options.bg, presenterOpen: !presenter.hidden });
  draw();
  requestAnimationFrame(loop);
}
