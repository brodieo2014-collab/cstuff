(() => {
  const $ = (id) => document.getElementById(id);
  const modal = $('modal'), stage = $('stage');
  let current = null, stop = null;

  const best = (id) => +localStorage.getItem('cstuff:best:' + id) || 0;
  const api = {
    id: '',
    score(n) { $('g-score').textContent = n; },
    over(n) {
      if (n > best(this.id)) { try { localStorage.setItem('cstuff:best:' + this.id, n); } catch {} }
      $('g-best').textContent = best(this.id); renderCards();
    },
  };

  function keyGuard(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  }
  function swipe(el, cb) {
    let sx, sy;
    el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return cb('tap');
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
  }
  function mkCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; stage.appendChild(c); return c;
  }

  /* ---------- Snake ---------- */
  function snake() {
    const N = 20, S = 24, c = mkCanvas(N * S, N * S), x = c.getContext('2d');
    let body, dir, next, food, score, dead, timer, delay;
    function reset() {
      body = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }]; dir = next = { x: 1, y: 0 };
      score = 0; dead = false; delay = 120; api.score(0); place(); loop();
    }
    function place() {
      do { food = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 }; }
      while (body.some((b) => b.x === food.x && b.y === food.y));
    }
    function loop() { clearTimeout(timer); timer = setTimeout(() => { tick(); if (!dead) loop(); }, delay); }
    function tick() {
      dir = next;
      const h = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || body.some((b) => b.x === h.x && b.y === h.y)) {
        dead = true; api.over(score); draw(); return;
      }
      body.unshift(h);
      if (h.x === food.x && h.y === food.y) { score++; api.score(score); delay = Math.max(60, delay - 2); place(); } else body.pop();
      draw();
    }
    function draw() {
      x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#ff8a3d'; x.beginPath(); x.arc(food.x * S + S / 2, food.y * S + S / 2, S * 0.38, 0, 7); x.fill();
      body.forEach((b, i) => { x.fillStyle = i ? '#7ccf5b' : '#b8f08a'; x.fillRect(b.x * S + 1, b.y * S + 1, S - 2, S - 2); });
      if (dead) { x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#fff'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center'; x.fillText('Game over — press Space / tap', c.width / 2, c.height / 2); }
    }
    const set = (d) => { if (d.x !== -dir.x || d.y !== -dir.y) next = d; };
    const dirs = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const kd = (e) => {
      keyGuard(e);
      const m = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' }[e.key];
      if (m) set(dirs[m]); else if (e.key === ' ' && dead) reset();
    };
    addEventListener('keydown', kd);
    swipe(c, (d) => { if (d === 'tap') { if (dead) reset(); } else set(dirs[d]); });
    reset();
    return () => { clearTimeout(timer); removeEventListener('keydown', kd); };
  }

  /* ---------- Bricks ---------- */
  function bricks() {
    const W = 480, H = 360, c = mkCanvas(W, H), x = c.getContext('2d');
    let paddle, ball, grid, score, lives, raf, state, keys = {};
    const cols = 8, rows = 5, bw = 52, bh = 18, pad = 6, ox = 12, oy = 40;
    const colors = ['#ff6b35', '#ff8a3d', '#f5b942', '#a3d65c', '#7ccf5b'];
    function reset() {
      paddle = { x: W / 2 - 40, w: 80 }; score = 0; lives = 3; state = 'ready'; api.score(0);
      grid = Array.from({ length: rows }, () => Array(cols).fill(1)); serve();
    }
    function serve() { ball = { x: W / 2, y: H - 40, vx: 3 * (Math.random() < 0.5 ? -1 : 1), vy: -3.6, r: 6 }; state = 'ready'; }
    function step() {
      if (keys.ArrowLeft || keys.a) paddle.x -= 6;
      if (keys.ArrowRight || keys.d) paddle.x += 6;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
      if (state === 'play') {
        ball.x += ball.vx; ball.y += ball.vy;
        if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
        if (ball.y < ball.r) ball.vy *= -1;
        if (ball.vy > 0 && ball.y + ball.r >= H - 20 && ball.y + ball.r <= H - 8 && ball.x > paddle.x - 4 && ball.x < paddle.x + paddle.w + 4) {
          const off = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
          const sp = Math.min(7.5, Math.hypot(ball.vx, ball.vy) + 0.1);
          ball.vx = off * sp * 0.8; ball.vy = -Math.sqrt(Math.max(1, sp * sp - ball.vx * ball.vx));
        }
        for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
          if (!grid[r][q]) continue;
          const bx = ox + q * (bw + pad), by = oy + r * (bh + pad);
          if (ball.x > bx - ball.r && ball.x < bx + bw + ball.r && ball.y > by - ball.r && ball.y < by + bh + ball.r) {
            grid[r][q] = 0; ball.vy *= -1; score += 10; api.score(score);
            if (grid.every((row) => row.every((v) => !v))) { grid = grid.map((row) => row.map(() => 1)); ball.vy *= 1.08; }
            r = rows; break;
          }
        }
        if (ball.y > H + 10) { lives--; if (lives <= 0) { state = 'over'; api.over(score); } else serve(); }
      } else if (state === 'ready') { ball.x = paddle.x + paddle.w / 2; ball.y = H - 28; }
      draw(); raf = requestAnimationFrame(step);
    }
    function draw() {
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      grid.forEach((row, r) => row.forEach((v, q) => { if (v) { x.fillStyle = colors[r]; x.fillRect(ox + q * (bw + pad), oy + r * (bh + pad), bw, bh); } }));
      x.fillStyle = '#ececec'; x.fillRect(paddle.x, H - 20, paddle.w, 10);
      x.fillStyle = '#ff8a3d'; x.beginPath(); x.arc(ball.x, ball.y, ball.r, 0, 7); x.fill();
      x.fillStyle = '#8b8b93'; x.font = '14px sans-serif'; x.textAlign = 'left'; x.fillText('Lives: ' + lives, 12, 22);
      x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif';
      if (state === 'ready') x.fillText('Click / tap / Space to launch', W / 2, H / 2 + 40);
      if (state === 'over') { x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.fillText('Game over — click to retry', W / 2, H / 2); }
    }
    const act = () => { if (state === 'ready') state = 'play'; else if (state === 'over') reset(); };
    const kd = (e) => { keyGuard(e); keys[e.key] = true; if (e.key === ' ') act(); };
    const ku = (e) => { keys[e.key] = false; };
    const move = (cx) => { const r = c.getBoundingClientRect(); paddle.x = ((cx - r.left) / r.width) * W - paddle.w / 2; };
    c.addEventListener('mousemove', (e) => move(e.clientX));
    c.addEventListener('touchmove', (e) => { move(e.touches[0].clientX); }, { passive: true });
    c.addEventListener('click', act);
    c.addEventListener('touchstart', (e) => { move(e.touches[0].clientX); act(); }, { passive: true });
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    reset(); raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  }

  /* ---------- Dash (runner) ---------- */
  function dash() {
    const W = 560, H = 220, G = 175, c = mkCanvas(W, H), x = c.getContext('2d');
    let p, obs, speed, score, over, raf, tick, nextGap;
    function reset() { p = { y: G - 30, vy: 0, w: 28, h: 30 }; obs = []; speed = 5; score = 0; over = false; tick = 0; nextGap = 60; api.score(0); }
    const jump = () => { if (over) { reset(); return; } if (p.y >= G - p.h - 0.5) p.vy = -11.5; };
    function step() {
      if (!over) {
        tick++; p.vy += 0.62; p.y += p.vy;
        if (p.y > G - p.h) { p.y = G - p.h; p.vy = 0; }
        if (--nextGap <= 0) {
          const h = 22 + ((Math.random() * 26) | 0), w = 16 + ((Math.random() * 18) | 0);
          obs.push({ x: W + 10, w, h }); nextGap = 50 + ((Math.random() * 60) | 0) + (28 - speed * 2 > 0 ? 28 - speed * 2 : 0);
        }
        obs.forEach((o) => (o.x -= speed)); obs = obs.filter((o) => o.x + o.w > -10);
        speed += 0.0025; if (tick % 6 === 0) { score++; api.score(score); }
        for (const o of obs) if (50 + p.w - 4 > o.x && 50 + 4 < o.x + o.w && p.y + p.h > G - o.h + 3) { over = true; api.over(score); }
      }
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#2a2a2f'; x.fillRect(0, G, W, 2);
      x.fillStyle = '#ff8a3d'; x.fillRect(50, p.y, p.w, p.h);
      x.fillStyle = '#000'; x.fillRect(50 + 18, p.y + 7, 5, 5);
      x.fillStyle = '#7ccf5b'; obs.forEach((o) => x.fillRect(o.x, G - o.h, o.w, o.h));
      if (over) { x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.fillText('Game over — press Space / tap', W / 2, H / 2); }
      raf = requestAnimationFrame(step);
    }
    const kd = (e) => { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { keyGuard(e); jump(); } };
    addEventListener('keydown', kd);
    c.addEventListener('mousedown', jump); c.addEventListener('touchstart', (e) => { e.preventDefault(); jump(); }, { passive: false });
    reset(); raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); };
  }

  /* ---------- Whack-a-mole ---------- */
  function whack() {
    const g = document.createElement('div'); g.className = 'mole-grid'; stage.appendChild(g);
    const holes = []; let up = -1, score = 0, left = 30, tm, run = false, hide;
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button'); b.className = 'hole'; b.setAttribute('aria-label', 'hole ' + (i + 1));
      b.onclick = () => {
        if (!run) { startRound(); return; }
        if (i === up) { score++; api.score(score); b.classList.remove('up'); b.textContent = ''; up = -1; }
      };
      holes.push(b); g.appendChild(b);
    }
    function pop() {
      if (!run) return;
      if (up >= 0) { holes[up].classList.remove('up'); holes[up].textContent = ''; }
      let n; do { n = (Math.random() * 9) | 0; } while (n === up);
      up = n; holes[n].classList.add('up'); holes[n].textContent = '🐹';
      hide = setTimeout(pop, 450 + Math.random() * 450);
    }
    function startRound() {
      run = true; score = 0; left = 30; api.score(0); $('g-hint').textContent = 'Time left: 30s'; pop();
      tm = setInterval(() => {
        left--; $('g-hint').textContent = 'Time left: ' + left + 's';
        if (left <= 0) {
          run = false; clearInterval(tm); clearTimeout(hide);
          holes.forEach((h) => { h.classList.remove('up'); h.textContent = ''; }); up = -1;
          api.over(score); $('g-hint').textContent = 'Time! You whacked ' + score + '. Tap any hole to play again.';
        }
      }, 1000);
    }
    $('g-hint').textContent = 'Tap any hole to start. You have 30 seconds.';
    return () => { clearInterval(tm); clearTimeout(hide); };
  }

  /* ---------- 2048 ---------- */
  function g2048() {
    const box = document.createElement('div'); box.className = 'g2048'; stage.appendChild(box);
    const cells = []; for (let i = 0; i < 16; i++) { const d = document.createElement('div'); d.className = 'cell'; box.appendChild(d); cells.push(d); }
    let b, score, over;
    const colors = { 0: '#1a1a1d', 2: '#f3e3c3', 4: '#f5cf8f', 8: '#f5a45a', 16: '#ff8a3d', 32: '#ff6b35', 64: '#e84a1c', 128: '#f5d442', 256: '#e8c62a', 512: '#a3d65c', 1024: '#7ccf5b', 2048: '#4fe0b0' };
    function add() { const e = []; b.forEach((v, i) => !v && e.push(i)); if (e.length) b[e[(Math.random() * e.length) | 0]] = Math.random() < 0.9 ? 2 : 4; }
    function reset() { b = Array(16).fill(0); score = 0; over = false; add(); add(); api.score(0); draw(); $('g-hint').textContent = 'Arrow keys or swipe to merge tiles.'; }
    function draw() { b.forEach((v, i) => { cells[i].textContent = v || ''; cells[i].style.background = colors[v] || '#4fe0b0'; cells[i].style.fontSize = v > 999 ? '1.1rem' : v > 99 ? '1.4rem' : '1.7rem'; }); }
    function slide(line) {
      const a = line.filter(Boolean), out = [];
      for (let i = 0; i < a.length; i++) { if (a[i] === a[i + 1]) { out.push(a[i] * 2); score += a[i] * 2; i++; } else out.push(a[i]); }
      while (out.length < 4) out.push(0); return out;
    }
    function move(d) {
      if (over) { reset(); return; }
      const old = b.join();
      for (let k = 0; k < 4; k++) {
        const idx = [0, 1, 2, 3].map((j) => (d === 'left' || d === 'right' ? k * 4 + j : j * 4 + k));
        if (d === 'right' || d === 'down') idx.reverse();
        const res = slide(idx.map((i) => b[i])); idx.forEach((i, j) => (b[i] = res[j]));
      }
      if (b.join() !== old) { add(); api.score(score); }
      draw();
      const full = b.every(Boolean);
      if (full) {
        let can = false;
        for (let i = 0; i < 16 && !can; i++) { const r = i % 4; if ((r < 3 && b[i] === b[i + 1]) || (i < 12 && b[i] === b[i + 4])) can = true; }
        if (!can) { over = true; api.over(score); $('g-hint').textContent = 'No moves left! Press any arrow to restart.'; }
      }
    }
    const kd = (e) => { const m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }[e.key]; if (m) { keyGuard(e); move(m); } };
    addEventListener('keydown', kd); swipe(box, (d) => d !== 'tap' && move(d));
    reset();
    return () => removeEventListener('keydown', kd);
  }

  /* ---------- Flappy Blob ---------- */
  function flappy() {
    const W = 360, H = 520, c = mkCanvas(W, H), x = c.getContext('2d');
    let b, pipes, score, over, started, raf, frames;
    const GAP = 140, SPEED = 2.4;
    function reset() { b = { y: H / 2, vy: 0 }; pipes = []; score = 0; over = false; started = false; frames = 0; api.score(0); }
    const flap = () => { if (over) { reset(); return; } started = true; b.vy = -7.2; };
    function step() {
      if (started && !over) {
        frames++; b.vy += 0.45; b.y += b.vy;
        if (frames % 95 === 1) pipes.push({ x: W + 10, top: 60 + Math.random() * (H - GAP - 140), done: false });
        pipes.forEach((p) => (p.x -= SPEED)); pipes = pipes.filter((p) => p.x > -70);
        for (const p of pipes) {
          if (!p.done && p.x + 50 < 80) { p.done = true; score++; api.score(score); }
          if (100 > p.x && 64 < p.x + 50 && (b.y - 14 < p.top || b.y + 14 > p.top + GAP)) over = true;
        }
        if (b.y > H - 20 || b.y < -20) over = true;
        if (over) api.over(score);
      }
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#7ccf5b'; pipes.forEach((p) => { x.fillRect(p.x, 0, 50, p.top); x.fillRect(p.x, p.top + GAP, 50, H - p.top - GAP); });
      x.fillStyle = '#2a2a2f'; x.fillRect(0, H - 6, W, 6);
      x.fillStyle = '#ff8a3d'; x.beginPath(); x.arc(82, b.y, 14, 0, 7); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.arc(88, b.y - 4, 3, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = 'bold 22px sans-serif';
      if (!started) x.fillText('Tap / Space to flap', W / 2, H / 2 + 60);
      if (over) { x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.fillText('Game over — tap to retry', W / 2, H / 2); }
      raf = requestAnimationFrame(step);
    }
    const kd = (e) => { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { keyGuard(e); flap(); } };
    addEventListener('keydown', kd);
    c.addEventListener('mousedown', flap); c.addEventListener('touchstart', (e) => { e.preventDefault(); flap(); }, { passive: false });
    reset(); raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); };
  }

  /* ---------- Minesweeper ---------- */
  function mines() {
    const N = 9, M = 10;
    const box = document.createElement('div'); box.className = 'g2048'; box.style.gridTemplateColumns = 'repeat(' + N + ',1fr)'; box.style.gap = '3px'; box.style.width = 'min(396px,100%)';
    stage.appendChild(box);
    let cells, over, first, flags, revealed, flagMode = false;
    const nums = ['', '#5b8cff', '#7ccf5b', '#ff6b6b', '#b36bff', '#ff8a3d', '#2dd4bf', '#fff', '#8b8b93'];
    const nb = (i) => { const r = (i / N) | 0, q = i % N, out = []; for (let a = -1; a <= 1; a++) for (let d = -1; d <= 1; d++) { if (!a && !d) continue; const rr = r + a, qq = q + d; if (rr >= 0 && rr < N && qq >= 0 && qq < N) out.push(rr * N + qq); } return out; };
    function reset() {
      cells = Array.from({ length: N * N }, () => ({ m: false, r: false, f: false, n: 0 }));
      over = false; first = true; flags = 0; revealed = 0; api.score(0); box.textContent = '';
      cells.forEach((cell, i) => {
        const d = document.createElement('div'); d.className = 'cell'; d.style.fontSize = '1.1rem'; d.style.cursor = 'pointer'; d.style.userSelect = 'none';
        d.addEventListener('click', () => act(i, flagMode)); d.addEventListener('contextmenu', (e) => { e.preventDefault(); act(i, true); });
        box.appendChild(d); cell.el = d;
      });
      paint(); hint();
    }
    function hint() { $('g-hint').textContent = over ? 'Tap any square to play again.' : 'Click to dig. Right-click (or the flag button) to flag. Mines left: ' + (M - flags); }
    function plant(safe) {
      const bad = new Set([safe, ...nb(safe)]); let n = 0;
      while (n < M) { const i = (Math.random() * N * N) | 0; if (!cells[i].m && !bad.has(i)) { cells[i].m = true; n++; } }
      cells.forEach((cell, i) => (cell.n = nb(i).filter((j) => cells[j].m).length));
    }
    function reveal(i) {
      const st = [i];
      while (st.length) {
        const k = st.pop(), cell = cells[k];
        if (cell.r || cell.f) continue;
        cell.r = true; revealed++;
        if (cell.n === 0 && !cell.m) st.push(...nb(k));
      }
    }
    function act(i, flag) {
      if (over) { reset(); return; }
      const cell = cells[i];
      if (flag) { if (!cell.r) { cell.f = !cell.f; flags += cell.f ? 1 : -1; } paint(); hint(); return; }
      if (cell.f || cell.r) return;
      if (first) { plant(i); first = false; }
      if (cell.m) { over = true; api.over(revealed); cells.forEach((q) => { if (q.m) q.r = true; }); paint(); hint(); return; }
      reveal(i); api.score(revealed);
      if (revealed === N * N - M) { over = true; api.over(revealed + 50); $('g-hint').textContent = 'You cleared the board! Tap to play again.'; paint(); return; }
      paint(); hint();
    }
    function paint() {
      cells.forEach((cell) => {
        const d = cell.el;
        if (cell.r) { d.style.background = cell.m ? '#ff4d5e' : '#0b0b0c'; d.style.color = nums[cell.n] || '#fff'; d.textContent = cell.m ? '✸' : (cell.n || ''); }
        else { d.style.background = '#2a2a2f'; d.textContent = cell.f ? '⚑' : ''; d.style.color = '#ff8a3d'; }
      });
    }
    const fb = document.createElement('button'); fb.textContent = '⚑ Flag mode: off'; fb.style.marginTop = '10px';
    fb.onclick = () => { flagMode = !flagMode; fb.textContent = '⚑ Flag mode: ' + (flagMode ? 'on' : 'off'); };
    stage.appendChild(fb); stage.style.flexDirection = 'column'; stage.style.alignItems = 'center';
    reset();
    return () => { stage.style.flexDirection = ''; stage.style.alignItems = ''; };
  }

  const games = [
    { id: 'snake', name: 'Snake', em: '🐍', desc: 'Eat, grow, don\'t crash.', hint: 'Arrow keys / WASD or swipe.', run: snake },
    { id: 'bricks', name: 'Bricks', em: '🧱', desc: 'Smash every brick with the ball.', hint: 'Move mouse, touch, or use arrow keys.', run: bricks },
    { id: 'dash', name: 'Dash', em: '🦖', desc: 'Jump over the obstacles.', hint: 'Space / Up / tap to jump.', run: dash },
    { id: 'whack', name: 'Whack-a-Mole', em: '🔨', desc: '30 seconds. Hit them all.', hint: '', run: whack },
    { id: 'flappy', name: 'Flappy Blob', em: '🟠', desc: 'Flap through the pipes.', hint: 'Space / click / tap to flap.', run: flappy },
    { id: 'mines', name: 'Minesweeper', em: '💣', desc: 'Clear the board, avoid the mines.', hint: '', run: mines },
    { id: '2048', name: '2048', em: '🔢', desc: 'Merge tiles to reach 2048.', hint: '', run: g2048 },
  ];

  function renderCards() {
    const grid = $('grid'); grid.textContent = '';
    games.forEach((g) => {
      const b = document.createElement('button'); b.className = 'game';
      const parts = [['em', g.em], ['nm', g.name], ['ds', g.desc], ['bs', 'Best: ' + best(g.id)]];
      parts.forEach(([cls, t]) => { const s = document.createElement('span'); s.className = cls; s.textContent = t; b.appendChild(s); });
      b.onclick = () => openGame(g); grid.appendChild(b);
    });
  }
  function openGame(g) {
    closeGame(); current = g; api.id = g.id;
    $('g-title').textContent = g.name; $('g-hint').textContent = g.hint; $('g-score').textContent = 0; $('g-best').textContent = best(g.id);
    modal.classList.add('open'); stop = g.run();
  }
  function closeGame() { if (stop) stop(); stop = null; stage.textContent = ''; modal.classList.remove('open'); current = null; }
  $('g-close').onclick = closeGame;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeGame(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGame(); });
  renderCards();
})();
