/*!
 * snake-bg.js
 * A self-playing snake in the page background, plus a hidden playable version.
 *
 * Usage (base.html, just before </body>):
 *   <script src="{{ url_for('static', filename='js/snake-bg.js') }}" defer></script>
 *
 * Optional:
 *   - Set the colour in CSS:  :root { --snake-color: #22c55e; }
 *   - Easter egg (desktop):   type the Konami code  ↑ ↑ ↓ ↓ ← → ← → B A
 *   - Easter egg (any device): add data-snake-play to any element, e.g.
 *       <span data-snake-play>© Tat Stephen</span>
 *   - While playing: arrows / WASD or swipe. Space = retry, Esc = exit.
 */
(() => {
  'use strict';
  if (window.__snakeBg) return;
  window.__snakeBg = true;

  /* ---------- settings ---------- */
  const CFG = {
    bgOpacity: 0.6,       // how visible the background snake is (0 to 1)
    bgTick: 90,           // ms per move in background mode
    autoMaxLen: 28,       // background snake restarts at this score so it never takes over
    playTick: 120,        // ms per move at the start of a played game
    playMinTick: 60,      // fastest speed in a played game
    defaultColor: '#22c55e',
    defaultFoodColor: '#ef4444',   // red ball; override with --snake-food-color in CSS
    bestKey: 'snakeBest',
  };

  const DIRS = [
    { x: 1, y: 0 },   // 0 right
    { x: 0, y: 1 },   // 1 down
    { x: -1, y: 0 },  // 2 left
    { x: 0, y: -1 },  // 3 up
  ];
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

  /* ---------- helpers ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } },
  };
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- state ---------- */
  let canvas, ctx, exitBtn;
  let cell = 24, cols = 0, rows = 0, offX = 0, offY = 0;
  let mode = 'bg';                       // 'bg' | 'play'
  // Background snake runs unless the visitor prefers reduced motion
  // (the easter egg still works for them).
  const enabled = !reduceMotion;
  let snake = [], dir = DIRS[0], food = { x: 0, y: 0 };
  let score = 0, alive = true, deadAt = 0, pending = [];
  let best = Number(store.get(CFG.bestKey)) || 0;
  let accent = CFG.defaultColor;
  let foodColor = CFG.defaultFoodColor;
  let raf = 0, last = 0;

  const idx = (x, y) => y * cols + x;

  /* ---------- setup ---------- */
  function init() {
    const style = document.createElement('style');
    style.textContent = `
      #snake-canvas{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;
        opacity:${CFG.bgOpacity};transition:opacity .3s}
      #snake-canvas.is-off{opacity:0}
      #snake-canvas.is-play{z-index:9998;pointer-events:auto;opacity:1;touch-action:none}
      #snake-exit{display:none;position:fixed;top:12px;right:12px;z-index:9999;font:14px/1 system-ui,sans-serif;
        padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.6);background:rgba(0,0,0,.4);
        color:#fff;cursor:pointer}
      body.snake-playing{overflow:hidden}
      body.snake-playing #snake-exit{display:block}
    `;
    document.head.appendChild(style);

    canvas = document.createElement('canvas');
    canvas.id = 'snake-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    if (!enabled) canvas.classList.add('is-off');
    ctx = canvas.getContext('2d');

    exitBtn = document.createElement('button');
    exitBtn.id = 'snake-exit';
    exitBtn.type = 'button';
    exitBtn.textContent = 'Exit game';
    exitBtn.addEventListener('click', exitPlay);

    document.body.append(canvas, exitBtn);

    layout();
    newGame();
    if (enabled) start();

    addEventListener('resize', onResize);
    addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else if (enabled || mode === 'play') start();
    });
    bindTouch();

    if (window.console) console.log('%c🐍 psst… try the Konami code.', 'color:' + accent);
  }

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = w < 640 ? 22 : 30;
    cols = Math.max(8, Math.floor(w / cell));
    rows = Math.max(8, Math.floor(h / cell));
    offX = (w - cols * cell) / 2;
    offY = (h - rows * cell) / 2;
  }

  let resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const oc = cols, or = rows;
      layout();
      if (cols !== oc || rows !== or) newGame(); else draw();
    }, 150);
  }

  /* ---------- game ---------- */
  function newGame() {
    const cs = getComputedStyle(document.documentElement);
    accent = cs.getPropertyValue('--snake-color').trim() || CFG.defaultColor;
    foodColor = cs.getPropertyValue('--snake-food-color').trim() || CFG.defaultFoodColor;
    const len = mode === 'play' ? 3 : 4;
    const y = Math.floor(rows / 2), x0 = Math.floor(cols / 4);
    snake = [];
    for (let i = 0; i < len; i++) snake.push({ x: (x0 - i + cols) % cols, y });
    dir = DIRS[0];
    pending = [];
    score = 0;
    alive = true;
    placeFood();
    draw();
  }

  function placeFood() {
    const taken = new Uint8Array(cols * rows);
    for (const s of snake) taken[idx(s.x, s.y)] = 1;
    const free = [];
    for (let i = 0; i < taken.length; i++) if (!taken[i]) free.push(i);
    if (!free.length) { newGame(); return; }
    const i = free[Math.floor(Math.random() * free.length)];
    food = { x: i % cols, y: (i / cols) | 0 };
  }

  function flood(sx, sy, blocked) {
    const seen = new Uint8Array(cols * rows);
    const stack = [idx(sx, sy)];
    seen[stack[0]] = 1;
    let n = 0;
    while (stack.length) {
      const c = stack.pop();
      n++;
      const cx = c % cols, cy = (c / cols) | 0;
      for (const d of DIRS) {
        const ni = idx((cx + d.x + cols) % cols, (cy + d.y + rows) % rows);
        if (!blocked[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    return n;
  }

  // Breadth-first search to the food; if there's no path, head for the roomiest side.
  function autopilot() {
    const head = snake[0], n = snake.length;
    const blocked = new Uint8Array(cols * rows);
    for (let i = 0; i < n - 1; i++) blocked[idx(snake[i].x, snake[i].y)] = 1; // tail tip will move away
    const start = idx(head.x, head.y), target = idx(food.x, food.y);
    const first = new Int8Array(cols * rows).fill(-1);
    const seen = new Uint8Array(cols * rows);
    seen[start] = 1;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      if (c === target) return DIRS[first[c]];
      const cx = c % cols, cy = (c / cols) | 0;
      for (let d = 0; d < 4; d++) {
        const ni = idx((cx + DIRS[d].x + cols) % cols, (cy + DIRS[d].y + rows) % rows);
        if (blocked[ni] || seen[ni]) continue;
        seen[ni] = 1;
        first[ni] = c === start ? d : first[c];
        queue.push(ni);
      }
    }
    let bestDir = null, bestArea = -1;
    for (const d of DIRS) {
      const nx = (head.x + d.x + cols) % cols, ny = (head.y + d.y + rows) % rows;
      if (blocked[idx(nx, ny)]) continue;
      const area = flood(nx, ny, blocked);
      if (area > bestArea) { bestArea = area; bestDir = d; }
    }
    return bestDir || dir;
  }

  function step(now) {
    if (!alive) return;

    if (mode === 'bg') {
      dir = autopilot();
    } else {
      while (pending.length) {
        const d = pending.shift();
        const reverse = d.x === -dir.x && d.y === -dir.y;
        const same = d.x === dir.x && d.y === dir.y;
        if (!reverse && !same) { dir = d; break; }
      }
    }

    const head = snake[0];
    const nx = (head.x + dir.x + cols) % cols;
    const ny = (head.y + dir.y + rows) % rows;
    const eating = nx === food.x && ny === food.y;
    const body = eating ? snake : snake.slice(0, -1);

    if (body.some(s => s.x === nx && s.y === ny)) {
      alive = false;
      deadAt = now;
      if (mode === 'play' && score > best) { best = score; store.set(CFG.bestKey, String(best)); }
      return;
    }

    snake.unshift({ x: nx, y: ny });
    if (eating) {
      score++;
      placeFood();
      if (mode === 'bg' && score >= CFG.autoMaxLen) { alive = false; deadAt = now; }
    } else {
      snake.pop();
    }
  }

  /* ---------- loop ---------- */
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const tick = mode === 'play' ? Math.max(CFG.playMinTick, CFG.playTick - score * 2) : CFG.bgTick;
    if (t - last < tick) return;
    last = t;
    if (!alive && mode === 'bg' && t - deadAt > 600) { newGame(); return; }
    step(t);
    draw();
  }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  /* ---------- drawing ---------- */
  function rect(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
  }

  function draw() {
    const w = innerWidth, h = innerHeight;
    ctx.clearRect(0, 0, w, h);
    if (mode === 'play') {
      ctx.fillStyle = 'rgba(10,12,16,.94)';
      ctx.fillRect(0, 0, w, h);
    }
    // food: big glowing ball in its own colour
    ctx.fillStyle = foodColor;
    ctx.shadowColor = foodColor;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(offX + food.x * cell + cell / 2, offY + food.y * cell + cell / 2, cell * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // snake (head solid and glowing, tail fades)
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    const pad = 2;
    for (let i = snake.length - 1; i >= 0; i--) {
      ctx.shadowBlur = i === 0 ? 14 : 0;
      ctx.globalAlpha = 0.55 + 0.45 * (1 - i / snake.length);
      rect(offX + snake[i].x * cell + pad, offY + snake[i].y * cell + pad, cell - pad * 2, cell - pad * 2, 7);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (mode === 'play') hud();
  }

  function hud() {
    ctx.fillStyle = '#fff';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Score ' + score + '   Best ' + best, 16, 30);
    if (!alive) {
      ctx.textAlign = 'center';
      ctx.font = '700 28px system-ui, sans-serif';
      ctx.fillText('Game over', innerWidth / 2, innerHeight / 2 - 8);
      ctx.font = '400 15px system-ui, sans-serif';
      ctx.fillText('Space or tap to retry · Esc to exit', innerWidth / 2, innerHeight / 2 + 22);
    }
  }

  /* ---------- easter egg: play mode ---------- */
  function enterPlay() {
    if (mode === 'play') return;
    mode = 'play';
    canvas.classList.remove('is-off');
    canvas.classList.add('is-play');
    document.body.classList.add('snake-playing');
    newGame();
    start();
  }

  function exitPlay() {
    if (mode !== 'play') return;
    mode = 'bg';
    canvas.classList.remove('is-play');
    document.body.classList.remove('snake-playing');
    if (!enabled) { canvas.classList.add('is-off'); stop(); }
    newGame();
  }

  let buf = [];
  function onKey(e) {
    const k = (e.key || '').toLowerCase();

    if (mode === 'play') {
      const map = { arrowup: 3, w: 3, arrowdown: 1, s: 1, arrowleft: 2, a: 2, arrowright: 0, d: 0 };
      if (k in map) { e.preventDefault(); if (pending.length < 2) pending.push(DIRS[map[k]]); }
      else if (k === ' ' || k === 'enter') { e.preventDefault(); if (!alive) newGame(); }
      else if (k === 'escape') exitPlay();
      return;
    }

    const t = e.target;
    if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;
    buf.push(k);
    if (buf.length > KONAMI.length) buf.shift();
    if (buf.length === KONAMI.length && KONAMI.every((v, i) => buf[i] === v)) { buf = []; enterPlay(); }
  }

  function onDocClick(e) {
    const el = e.target.closest && e.target.closest('[data-snake-play]');
    if (el) { e.preventDefault(); enterPlay(); }
  }

  function bindTouch() {
    let tx = 0, ty = 0;
    canvas.addEventListener('touchstart', e => {
      const t = e.changedTouches[0]; tx = t.clientX; ty = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', e => {
      if (mode !== 'play') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - tx, dy = t.clientY - ty;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { if (!alive) newGame(); return; }
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS[0] : DIRS[2]) : (dy > 0 ? DIRS[1] : DIRS[3]);
      if (pending.length < 2) pending.push(d);
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
