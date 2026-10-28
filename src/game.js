import { hash, moderatorCommand } from './twitch.js';
import { layoutText } from './font.js';

export const WIDTH = 1920, HEIGHT = 1080, STEP = 1 / 120;
const CELL = 96;
const gold = '#ffd56b';

function raidColor(color, offset) {
  if (color.startsWith('hsl(')) return color.replace(/hsl\(([\d.]+)/, (_, hue) => `hsl(${(+hue + offset + 360) % 360}`);
  const [r, g, b] = color.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const hue = !delta ? 0 : 60 * (max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  return `hsl(${(hue + offset + 360) % 360} ${saturation * 100}% ${lightness * 100}%)`;
}

export class Game {
  constructor(options = {}) {
    this.options = options;
    this.random = options.random ?? Math.random;
    this.sound = options.sound ?? (() => {});
    this.reducedMotion = options.reducedMotion ?? false;
    this.level = 0;
    this.clock = 0;
    this.particles = [];
    this.banners = [];
    this.shake = 0;
    this.hitStop = 0;
    this.query = 0;
    this.rebuild();
  }

  rebuild() {
    this.level++;
    this.balls = [];
    this.pending = [];
    this.scores = new Map();
    this.launched = 0;
    this.elapsed = 0;
    this.win = null;
    this.hitStop = 0;
    this.banners = [];
    this.particles = [];
    this.grid = new Map();
    const strength = (this.level - 1) * .3;
    const pixels = layoutText(this.options.text || 'BE RIGHT BACK');
    const order = pixels.map((_, index) => index).sort((a, b) => hash(`brick${a}`) - hash(`brick${b}`));
    const tougher = new Set(order.slice(0, Math.round(pixels.length * (strength % 1))));
    this.bricks = pixels.map((pixel, index) => {
      const hp = Math.min(3, 1 + Math.floor(strength) + Number(tougher.has(index)));
      const hue = 167 - (pixel.y - 160) / 410 * 130;
      const brick = { ...pixel, hp, maxHp: hp, color: `hsl(${hue} 86% 68%)`, flash: 0 };
      this.cells(pixel.x, pixel.y, pixel.x + pixel.w, pixel.y + pixel.h, key => {
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(brick);
      });
      return brick;
    });
    this.remaining = this.bricks.length;
    this.total = this.remaining;
  }

  cells(x1, y1, x2, y2, visit) {
    for (let x = Math.floor(x1 / CELL); x <= Math.floor(x2 / CELL); x++)
      for (let y = Math.floor(y1 / CELL); y <= Math.floor(y2 / CELL); y++) visit(`${x},${y}`);
  }

  leaders() { return [...this.scores.values()].sort((a, b) => b.score - a.score || a.user.localeCompare(b.user)).slice(0, 5); }

  banner(title, subtitle = '', color = '#91ffd4') {
    this.banners.push({ title, subtitle, color, age: 0 });
    if (this.banners.length > 3) this.banners.shift();
  }

  receive(event) {
    const command = moderatorCommand(event);
    if (command === 'rebuild') { this.rebuild(); return; }
    if (command === 'clear') { this.balls = []; this.pending = []; return; }
    if (event.type === 'announcement') { this.banner(event.text, `ANNOUNCEMENT · ${event.user}`); return; }
    if (this.win) return;
    if (event.type === 'raid') {
      const count = Math.min(80, Math.max(0, Math.floor(event.viewerCount)));
      for (let i = 0; i < count; i++) this.pending.push({ delay: i * 2 / Math.max(1, count - 1),
        event, extra: { x: 70 + (WIDTH - 140) * i / Math.max(1, count - 1), showLabel: i === 0,
          color: raidColor(event.color, (this.random() - .5) * 30) } });
      this.banner(`RAID! ${event.user} + ${event.viewerCount}`, 'THE WHOLE CREW IS HERE');
      this.shake = this.reducedMotion ? 0 : 12;
      this.sound('special');
    } else if (event.type === 'sub' || event.type === 'gift') {
      const count = event.type === 'sub' ? 5 : Math.min(50, Math.max(1, Math.floor(event.count)));
      for (let i = 0; i < count; i++) this.launch(event, { color: gold, angle: count === 1 ? 0 : (i / (count - 1) - .5) * Math.PI / 3 });
      this.banner(event.type === 'sub' ? `${event.user} subscribed!` : `${event.user} gifted ${event.count} subs!`, 'A LITTLE GOLD GOES A LONG WAY', gold);
      this.sound('special');
    } else if (event.type === 'chat') {
      if (event.bits > 0) {
        this.launch(event, { heavy: true, multiplier: Math.min(4, 1 + Math.sqrt(event.bits / 100)), budget: 10 + event.bits / 20 });
        this.banner(`${event.user} · ${event.bits} BITS`, 'COMING THROUGH', gold);
        this.shake = this.reducedMotion ? 0 : 9;
        this.sound('special');
      } else {
        const special = event.highlighted || (event.reward && event.text);
        this.launch(event, { multiplier: special ? 3 : 1 });
        if (special) this.banner(event.text || `${event.user} takes a big shot!`,
          `${event.highlighted ? 'HIGHLIGHT' : 'REDEMPTION'} · ${event.user}`);
      }
    }
  }

  launch(event, extra = {}) {
    const angle = extra.angle ?? (this.random() - .5) * Math.PI / 3;
    const emote = event.type === 'chat' && !extra.heavy ? event.emotes?.[0]?.id : null;
    const size = extra.heavy ? 1 : (emote || event.mockFace ? 1.5 : 1) * Math.min(1.3, 1 + [...(event.text || '')].length / 300);
    const r = 13 * (extra.multiplier ?? 1) * size;
    const x = extra.x ?? 80 + hash(event.login) % (WIDTH - 160);
    const showLabel = extra.showLabel !== false && this.balls.filter(ball =>
      ball.showLabel && ball.age < 1.5 && !ball.dead && ball.y - ball.r < HEIGHT).length < 20;
    this.balls.push({ x: Math.max(r, Math.min(WIDTH - r, x)), y: HEIGHT - r, vx: Math.sin(angle) * 900,
      vy: -Math.cos(angle) * 900, r, color: extra.color || event.color, login: event.login,
      user: event.user, showLabel, age: 0, trail: [], trailTick: 0, squash: 0, squashAxis: 'y',
      heavy: extra.heavy, budget: extra.budget, touched: new Set(), first: event.firstMsg,
      emote, face: event.mockFace, dead: false });
    this.launched++;
  }

  burst(x, y, color, count = 9, power = 1) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2, speed = (80 + this.random() * 220) * power;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        age: 0, life: .4 + this.random() * .5, size: 3 + this.random() * 6, color });
    }
    if (this.particles.length > 1400) this.particles.splice(0, this.particles.length - 1400);
  }

  breakBrick(brick, ball) {
    brick.hp--;
    brick.flash = .12;
    this.sound('hit');
    if (brick.hp <= 0) {
      this.remaining--;
      this.burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color);
      if (ball) {
        const entry = this.scores.get(ball.login) || { user: ball.user, color: ball.color, score: 0 };
        entry.score++;
        this.scores.set(ball.login, entry);
        if (ball.heavy && --ball.budget <= 0) ball.dead = true;
      }
      if (this.remaining === 0) this.finish();
    }
    if (ball && (ball.heavy || ball.r >= 35)) this.hitStop = .03;
  }

  finish() {
    if (this.win) return;
    this.win = { age: 0, elapsed: this.elapsed, leaders: this.leaders().slice(0, 3), launched: this.launched };
    this.pending = [];
    this.banners = [];
    this.sound('win');
    for (let i = 0; i < 8; i++) this.burst(250 + i * 200, 450, i % 2 ? gold : '#91ffd4', 35, 2);
  }

  wipe() {
    for (const brick of this.bricks) if (brick.hp > 0) {
      brick.hp = 0;
      this.burst(brick.x, brick.y, brick.color, 3);
    }
    this.remaining = 0;
    this.finish();
  }

  collide(ball) {
    const query = ++this.query;
    const touching = ball.heavy ? new Set() : null;
    let reflected = false;
    this.cells(ball.x - ball.r, ball.y - ball.r, ball.x + ball.r, ball.y + ball.r, key => {
      for (const brick of this.grid.get(key) || []) {
        if (brick.hp <= 0 || brick.query === query || ball.dead || (reflected && !ball.heavy)) continue;
        brick.query = query;
        const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
        const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
        if ((ball.x - closestX) ** 2 + (ball.y - closestY) ** 2 >= ball.r ** 2) continue;
        if (ball.heavy) {
          touching.add(brick);
          if (ball.touched.has(brick)) continue;
        }
        else {
          const dx = ball.x - brick.x - brick.w / 2, dy = ball.y - brick.y - brick.h / 2;
          const overlapX = brick.w / 2 + ball.r - Math.abs(dx), overlapY = brick.h / 2 + ball.r - Math.abs(dy);
          if (overlapX < overlapY) {
            ball.x += Math.sign(dx || 1) * overlapX;
            ball.vx = Math.abs(ball.vx) * Math.sign(dx || 1);
            ball.squashAxis = 'x';
          } else {
            ball.y += Math.sign(dy || 1) * overlapY;
            ball.vy = Math.abs(ball.vy) * Math.sign(dy || 1);
            ball.squashAxis = 'y';
          }
          ball.squash = .14;
          reflected = true;
        }
        this.breakBrick(brick, ball);
      }
    });
    if (ball.heavy) ball.touched = touching;
  }

  update(dt) {
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt * 18);
    this.banners.forEach(banner => banner.age += dt);
    this.banners = this.banners.filter(banner => banner.age < 4);
    if (this.win) {
      this.win.age += dt;
      if (this.win.age >= 10.6) { this.rebuild(); return; }
    } else this.elapsed += dt;
    const scale = this.win && this.win.age < .6 && !this.reducedMotion ? .15 : 1;
    for (const particle of this.particles) {
      particle.age += dt * scale;
      particle.x += particle.vx * dt * scale;
      particle.y += particle.vy * dt * scale;
      particle.vy += 380 * dt * scale;
    }
    this.particles = this.particles.filter(particle => particle.age < particle.life);
    for (const ball of this.balls) ball.age += dt;
    this.balls = this.balls.filter(ball => !ball.dead && ball.age < 14 && ball.y < HEIGHT + ball.r);
    for (const item of this.pending) {
      item.delay -= dt;
      if (item.delay <= 0) this.launch(item.event, item.extra);
    }
    this.pending = this.pending.filter(item => item.delay > 0);
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    for (const brick of this.bricks) brick.flash = Math.max(0, brick.flash - dt);
    for (const ball of this.balls) {
      ball.squash = Math.max(0, ball.squash - dt);
      ball.trailTick += dt;
      if (ball.trailTick > .025) {
        ball.trailTick = 0;
        ball.trail.unshift({ x: ball.x, y: ball.y });
        if (ball.trail.length > 6) ball.trail.pop();
      }
      ball.x += ball.vx * dt * scale; ball.y += ball.vy * dt * scale;
      if (ball.x < ball.r || ball.x > WIDTH - ball.r) {
        ball.vx *= -1; ball.x = Math.max(ball.r, Math.min(WIDTH - ball.r, ball.x));
        ball.squash = .14; ball.squashAxis = 'x';
      }
      if (ball.y < ball.r) {
        ball.vy = Math.abs(ball.vy); ball.y = ball.r; ball.squash = .14; ball.squashAxis = 'y';
      }
      if (!this.win) this.collide(ball);
    }
    this.balls = this.balls.filter(ball => !ball.dead && ball.age < 14 && ball.y < HEIGHT + ball.r);
  }

  snapshot() {
    return { coordinates: '1920x1080; origin top-left; x right, y down', mode: this.win ? 'win' : 'playing',
      level: this.level, bricks: this.remaining, totalBricks: this.total, elapsed: this.elapsed,
      launched: this.launched, leaders: this.leaders(), pendingRaidBalls: this.pending.length,
      win: this.win, banners: this.banners.map(banner => banner.title),
      ballCount: this.balls.length, balls: this.balls.slice(0, 12).map(({ x, y, vx, vy, r, user, heavy, showLabel }) => ({ x, y, vx, vy, r, user, heavy, showLabel })) };
  }
}
