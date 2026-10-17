(() => {
  const canvas = document.getElementById('leaves');
  if (!canvas) return;
  if (window.cstuff && window.cstuff.get().leaves === false) { canvas.remove(); return; }
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['#c2410c', '#ea580c', '#f59e0b', '#b45309', '#9a3412', '#a16207', '#d97706', '#65a30d'];
  let w = 0, h = 0, dpr = 1, leaves = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(Math.min(60, Math.max(18, w / 28)) * (reduce ? 0.4 : 1));
    while (leaves.length < target) leaves.push(make(true));
    leaves.length = target;
  }
  function make(randomY) {
    const size = 10 + Math.random() * 18;
    return {
      x: Math.random() * w, y: randomY ? Math.random() * h : -40,
      size, vy: (0.35 + Math.random() * 0.8) * (size / 18) * (reduce ? 0.5 : 1),
      sway: 0.6 + Math.random() * 1.4, phase: Math.random() * 6.28, freq: 0.004 + Math.random() * 0.01,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.03,
      tilt: Math.random() * 6.28, vt: 0.01 + Math.random() * 0.03,
      color: colors[(Math.random() * colors.length) | 0], alpha: 0.35 + Math.random() * 0.5,
    };
  }
  function drawLeaf(l) {
    const s = l.size;
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.scale(1, 0.35 + Math.abs(Math.cos(l.tilt)) * 0.65);
    ctx.globalAlpha = l.alpha;
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.8, s * 0.5, 0, s);
    ctx.bezierCurveTo(-s * 0.8, s * 0.5, -s * 0.9, -s * 0.5, 0, -s);
    ctx.fill();
    ctx.globalAlpha = l.alpha * 0.7;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s * 1.25);
    ctx.stroke();
    ctx.restore();
  }
  let last = performance.now(), running = true;
  function frame(t) {
    if (!running) return;
    const dt = Math.min(3, (t - last) / 16.67); last = t;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      l.phase += l.freq * dt;
      l.y += l.vy * dt * 1.4;
      l.x += Math.sin(l.phase * 6) * l.sway * 0.5 * dt + 0.15 * dt;
      l.rot += l.vr * dt;
      l.tilt += l.vt * dt;
      if (l.y > h + 40 || l.x > w + 60) { leaves[i] = make(false); leaves[i].x = Math.random() * (w + 80) - 80; }
      drawLeaf(l);
    }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });
  resize();
  requestAnimationFrame(frame);
})();
