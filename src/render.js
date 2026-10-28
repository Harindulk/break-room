import { WIDTH, HEIGHT } from './game.js';

const ink = '#0a151c', white = '#effff9', mint = '#91ffd4';
export const formatTime = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;

export class Renderer {
  constructor(canvas, options) {
    this.ctx = canvas.getContext('2d');
    this.options = options;
    this.images = new Map();
    this.labels = new Map();
    this.fitted = new Map();
  }

  surface(width, height) {
    const canvas = this.options.createCanvas ? this.options.createCanvas(width, height) : document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    return canvas;
  }

  box(x, y, w, h, color, radius = 14) {
    const c = this.ctx;
    c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill();
  }

  text(text, x, y, size = 24, color = white, align = 'left', weight = 700) {
    const key = `${text}|${size}|${color}|${weight}`;
    let label = this.labels.get(key);
    if (!label) {
      const font = `${weight} ${size}px Arial, sans-serif`;
      this.ctx.font = font;
      const width = Math.ceil(this.ctx.measureText(text).width), pad = Math.ceil(size / 5);
      const canvas = this.surface(width + pad * 2, Math.ceil(size * 1.6));
      const c = canvas.getContext('2d');
      c.font = font; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.lineWidth = Math.max(3, size / 9); c.strokeStyle = ink; c.fillStyle = color;
      if (color !== ink) c.strokeText(text, pad, canvas.height / 2);
      c.fillText(text, pad, canvas.height / 2);
      label = { canvas, width, pad };
      // Names are rasterized once, rather than stroked on every frame of a busy raid.
      if (this.labels.size >= 512) this.labels.delete(this.labels.keys().next().value);
      this.labels.set(key, label);
    }
    const offset = align === 'center' ? label.width / 2 : align === 'right' ? label.width : 0;
    this.ctx.drawImage(label.canvas, x - offset - label.pad, y - label.canvas.height / 2);
  }

  fit(text, width, size = 24) {
    const key = `${text}|${width}|${size}`;
    if (this.fitted.has(key)) return this.fitted.get(key);
    const c = this.ctx;
    c.font = `700 ${size}px Arial, sans-serif`;
    const chars = [...String(text)];
    let result = text;
    if (c.measureText(text).width > width) {
      while (chars.length && c.measureText(chars.join('') + '…').width > width) chars.pop();
      result = chars.join('') + '…';
    }
    if (this.fitted.size >= 512) this.fitted.delete(this.fitted.keys().next().value);
    this.fitted.set(key, result);
    return result;
  }

  emote(id) {
    if (!this.images.has(id)) {
      if (this.images.size >= 128) this.images.delete(this.images.keys().next().value);
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`;
      this.images.set(id, image);
    }
    const image = this.images.get(id);
    return image.complete && image.naturalWidth ? image : null;
  }

  ball(ball) {
    const c = this.ctx;
    ball.trail.forEach((point, i) => {
      c.globalAlpha = .22 * (1 - i / 6);
      c.fillStyle = ball.color; c.beginPath(); c.arc(point.x, point.y, ball.r * (1 - i / 8), 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
    c.save(); c.translate(ball.x, ball.y);
    const squash = ball.squash / .14 * .23;
    c.scale(ball.squashAxis === 'x' ? 1 - squash : 1 + squash, ball.squashAxis === 'x' ? 1 + squash : 1 - squash);
    c.fillStyle = ball.color; c.strokeStyle = ink; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, ball.r, 0, Math.PI * 2); c.fill(); c.stroke();
    const sprite = ball.emote ? this.emote(ball.emote) : null;
    if (sprite) {
      c.save(); c.clip(); c.drawImage(sprite, -ball.r, -ball.r, ball.r * 2, ball.r * 2); c.restore();
    } else if (ball.face) {
      c.fillStyle = ink;
      for (const x of [-.3, .3]) { c.beginPath(); c.arc(ball.r * x, -ball.r * .15, 3, 0, Math.PI * 2); c.fill(); }
      c.beginPath(); c.arc(0, ball.r * .06, ball.r * .42, .1, Math.PI - .1); c.stroke();
    } else {
      c.fillStyle = '#ffffff88'; c.beginPath(); c.arc(-ball.r * .26, -ball.r * .28, ball.r * .22, 0, Math.PI * 2); c.fill();
    }
    if (ball.heavy) {
      c.lineWidth = 4; c.strokeStyle = '#ffd56b'; c.beginPath(); c.arc(0, 0, ball.r + 6, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    if (ball.first && ball.age < 1.5) {
      c.strokeStyle = mint; c.lineWidth = 3; c.globalAlpha = 1 - ball.age / 1.5;
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + ball.age * 2, radius = ball.r + 13 + ball.age * 6;
        const x = ball.x + Math.cos(angle) * radius, y = ball.y + Math.sin(angle) * radius;
        c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke();
      }
    }
    if (ball.showLabel && ball.age < 1.5) {
      c.globalAlpha = Math.min(1, (1.5 - ball.age) * 2);
      const name = this.fit(ball.user, 240, 20);
      const x = Math.max(130, Math.min(WIDTH - 130, ball.x));
      this.text(name, x, ball.y + ball.r + 25, 20, white, 'center');
      if (ball.first) this.text('first message!', x, ball.y + ball.r + 49, 18, mint, 'center');
    }
    c.globalAlpha = 1;
  }

  draw(game, status, mock, backRemaining) {
    const c = this.ctx;
    c.clearRect(0, 0, WIDTH, HEIGHT);
    if (this.options.bg) {
      if (!this.background) {
        this.background = this.surface(WIDTH, HEIGHT);
        const bg = this.background.getContext('2d');
        bg.fillStyle = '#101c23'; bg.fillRect(0, 0, WIDTH, HEIGHT);
        bg.fillStyle = '#20333b';
        for (let x = 32; x < WIDTH; x += 48) for (let y = 32; y < HEIGHT; y += 48) bg.fillRect(x, y, 3, 3);
        const glow = bg.createRadialGradient(960, 370, 20, 960, 370, 1050);
        glow.addColorStop(0, '#23483b88'); glow.addColorStop(1, '#101c2300');
        bg.fillStyle = glow; bg.fillRect(0, 0, WIDTH, HEIGHT);
      }
      c.drawImage(this.background, 0, 0);
    }
    c.save();
    if (game.shake && !game.reducedMotion) c.translate(Math.sin(game.clock * 107) * game.shake, Math.cos(game.clock * 93) * game.shake * .6);
    for (const brick of game.bricks) if (brick.hp > 0) {
      this.box(brick.x, brick.y + 4, brick.w, brick.h, '#050f18b3', 3);
      this.box(brick.x, brick.y, brick.w, brick.h, brick.flash > 0 ? white : brick.color, 3);
      if (brick.hp < brick.maxHp) this.box(brick.x, brick.y, brick.w, brick.h, '#07141a66', 3);
      if (brick.maxHp > 1) {
        c.fillStyle = '#102c37aa';
        for (let i = 0; i < brick.hp - 1; i++) c.fillRect(brick.x + 4 + i * 6, brick.y + brick.h - 7, 3, 3);
      }
      if (brick.hp < brick.maxHp) {
        c.strokeStyle = '#0a202bdd'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(brick.x + brick.w * .6, brick.y);
        c.lineTo(brick.x + brick.w * .4, brick.y + brick.h * .5);
        c.lineTo(brick.x + brick.w * .7, brick.y + brick.h * .6);
        c.lineTo(brick.x + brick.w * .45, brick.y + brick.h); c.stroke();
      }
    }
    for (const ball of game.balls) this.ball(ball);
    for (const p of game.particles) {
      c.globalAlpha = Math.max(0, 1 - p.age / p.life);
      this.box(p.x, p.y, p.size, p.size, p.color, 2);
    }
    c.globalAlpha = 1;
    c.restore();
    // HUD stays above the action and outside its screen shake.
    this.text('BREAK ROOM', 960, 66, 25, mint, 'center', 900);
    this.text(`ROUND ${String(game.level).padStart(2, '0')}  /  ${game.remaining} BRICKS LEFT`, 960, 133, 18, '#bfcec8', 'center');
    if (!game.win) {
      this.text('YOUR CHAT. YOUR WRECKING CREW.', 960, 790, 34, white, 'center', 900);
      this.text('Every message launches a ball. Talk the wall down.', 960, 833, 23, '#a4bcb3', 'center', 500);
      this.box(760, 882, 400, 6, '#446058', 3);
      this.box(760, 882, Math.max(6, 400 * (1 - game.remaining / game.total)), 6, mint, 3);
      this.text(`${formatTime(game.elapsed)} ELAPSED  ·  ${game.launched} BALLS LAUNCHED`, 960, 917, 17, '#b8cec5', 'center');
    }
    if (this.options.ui) this.hud(game, status, mock);
    if (backRemaining !== null) {
      this.box(777, 1000, 366, 48, '#0a151cdd', 24);
      this.text(backRemaining > 0 ? `BACK IN ${formatTime(Math.ceil(backRemaining))}` : 'BACK ANY SECOND', 960, 1024, 23, mint, 'center');
    }
    const banner = game.banners.at(-1);
    if (banner && !game.win) this.drawBanner(banner, game.reducedMotion);
    if (game.win && game.win.age >= .6) this.win(game);
  }

  hud(game, status, mock) {
    const colors = { connected: '#91ffd4', connecting: '#ffd56b', offline: '#ff807e', mock: '#8cc8ff' };
    this.box(48, 44, 335, 56, '#0a151cdb', 28);
    this.box(70, 65, 14, 14, colors[status] || colors.offline, 7);
    const label = this.options.channel ? `#${this.options.channel} · ${status}` : 'MOCK CHAT · LIVE DEMO';
    this.text(this.fit(label, 267, 18), 98, 73, 18);
    const leaders = game.leaders();
    this.box(1542, 44, 330, 70 + Math.max(1, leaders.length) * 32, '#0a151cdb', 18);
    this.text('BRICK BREAKERS', 1566, 77, 18, mint);
    if (!leaders.length) this.text('The first brick is yours.', 1566, 123, 18, '#a4bcb3', 'left', 500);
    leaders.forEach((leader, i) => {
      this.text(String(i + 1).padStart(2, '0'), 1566, 123 + i * 32, 16, '#7f9d92');
      this.text(this.fit(leader.user, 197, 20), 1606, 123 + i * 32, 20, leader.color);
      this.text(String(leader.score), 1847, 123 + i * 32, 20, white, 'right');
    });
    if (mock) {
      this.box(48, 840, 406, 200, '#0a151cdb', 16);
      this.text('THE DEMO DESK', 70, 871, 17, mint);
      this.text('R raid   S sub   G gifts   B bits   H highlight', 70, 906, 17);
      this.text('W win   T type a message   F fullscreen', 70, 936, 17);
      this.text(`SPACE ${mock.paused ? 'resume' : 'pause'}   + / − rate`, 70, 966, 17);
      this.text(`${mock.paused ? 'PAUSED' : 'PLAYING'}  ·  ${mock.rate.toFixed(1)} messages / sec`, 70, 1007, 17, '#8cc8ff');
    }
  }

  drawBanner(banner, reduced) {
    const c = this.ctx;
    const t = Math.min(1, banner.age / .4), overshoot = 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
    c.save(); c.globalAlpha = Math.max(0, Math.min(1, (4 - banner.age) / .8));
    c.translate(960, 670); c.scale(reduced ? 1 : .7 + overshoot * .3, reduced ? 1 : .7 + overshoot * .3);
    this.box(-740, -84, 1480, 168, banner.color, 22);
    this.text(this.fit(banner.title, 1360, 64), 0, -18, 64, ink, 'center', 900);
    this.text(this.fit(banner.subtitle, 1360, 22), 0, 45, 22, ink, 'center');
    c.restore();
  }

  win(game) {
    const { win } = game;
    const c = this.ctx;
    c.save(); c.globalAlpha = Math.min(1, (win.age - .6) * 4);
    this.box(430, 228, 1060, 620, '#0a151cf5', 30);
    this.box(478, 271, 7, 55, mint, 3);
    this.text('WALL: 0. CHAT: 1.', 960, 285, 20, mint, 'center');
    this.text('CHAT BROKE THROUGH', 960, 358, 52, white, 'center', 900);
    this.text(`IN ${formatTime(win.elapsed)}`, 960, 436, 76, mint, 'center', 900);
    this.text('THE WRECKING CREW', 960, 522, 18, '#9bb6aa', 'center');
    win.leaders.forEach((leader, i) => {
      this.text(`${['01', '02', '03'][i]}   ${this.fit(leader.user, 480, 28)}`, 660, 570 + i * 48, 28, leader.color);
      this.text(`${leader.score} bricks`, 1260, 570 + i * 48, 24, white, 'right');
    });
    if (!win.leaders.length) this.text('A team effort. A beautiful mess.', 960, 604, 26, white, 'center');
    this.text(`${win.launched} BALLS LAUNCHED  ·  ROUND ${game.level + 1} IN ${Math.max(0, Math.ceil(10.6 - win.age))}s`, 960, 759, 19, '#b8cec5', 'center');
    this.box(670, 803, 580 * Math.max(0, 1 - (win.age - .6) / 10), 5, mint, 2);
    c.restore();
  }
}
