/* Advanced games: cstuff's own cards and player, with the games sourced from gn-math.dev. */
const $ = (id) => document.getElementById(id);

// gn-math keeps its game list in the "assets" repo and the games/covers in the "html" and "covers" repos.
// jsDelivr refuses the oversized assets repo (HTTP 403), so the list is also tried straight from GitHub.
const GH = 'https://raw.githubusercontent.com/gn-math';
const JSD = 'https://cdn.jsdelivr.net/gh/gn-math';
const RELAY = '/gm'; // cstuff's own server fetches the files and serves them with the right file types
const SOURCE = {
  list: [RELAY + '/assets/zones.json'],
  covers: [RELAY + '/covers'],
  html: [RELAY + '/html'],
  site: 'https://gn-math.dev/',
};
const SKIP_SPECIAL = new Set(['flash', 'tools']); // Flash games need a plugin; tools aren't games.
const LEAD = {
  default: 'Quick games that run right in your browser. Your best scores are saved on this device.',
  advanced: 'Bigger games sourced from gn-math.dev. Search, pick one and play.',
};
const PAGE = 60;

let all = [], shown = [], limit = PAGE, loaded = false, loading = null;

const isHttps = (u) => /^https:\/\//i.test(u);
// "{HTML_URL}/12.html" -> "12.html"; anything not on the expected host is dropped.
const rel = (s, tag) => {
  s = String(s || '');
  if (!s.startsWith(tag + '/')) return '';
  const p = s.slice(tag.length + 1);
  return /(^|\/)\.\.(\/|$)|[\\:?#]|^\//.test(p) ? '' : p; // stay inside the game folder
};

function normalize(raw) {
  const arr = Array.isArray(raw) ? raw : (raw && (raw.zones || raw.games)) || [];
  const seen = new Set();
  return arr.map((z) => ({
    id: z && z.id,
    name: String((z && z.name) || '').trim(),
    cover: rel(z && z.cover, '{COVER_URL}'),
    path: rel(z && z.url, '{HTML_URL}'),
    special: Array.isArray(z && z.special) ? z.special : [],
  })).filter((z) => {
    if (!z.name || !z.path || z.id < 0 || z.special.some((x) => SKIP_SPECIAL.has(x)) || seen.has(z.path)) return false;
    seen.add(z.path); return true;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

async function getJSON(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function fetchList() {
  let last = null;
  for (const u of SOURCE.list) {
    try {
      const list = normalize(await getJSON(u, 20000));
      if (list.length) return list;
      last = new Error('empty list');
    } catch (e) { last = e; }
  }
  throw last || new Error('no source');
}

function render() {
  const q = $('a-search').value.trim().toLowerCase();
  shown = q ? all.filter((z) => z.name.toLowerCase().includes(q)) : all;
  const grid = $('a-grid'); grid.textContent = '';
  shown.slice(0, limit).forEach((z) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'acard';
    const cv = document.createElement('span'); cv.className = 'cv';
    if (z.cover) {
      const img = document.createElement('img'); img.loading = 'lazy'; img.alt = ''; img.referrerPolicy = 'no-referrer';
      let k = 0; const next = () => { if (k < SOURCE.covers.length) img.src = SOURCE.covers[k++] + '/' + z.cover; else { img.remove(); cv.textContent = '🎮'; } };
      img.onerror = next; next(); cv.appendChild(img);
    } else cv.textContent = '🎮';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = z.name;
    b.append(cv, nm); b.onclick = () => play(z); grid.appendChild(b);
  });
  $('a-more').hidden = shown.length <= limit;
  $('a-count').textContent = shown.length + (shown.length === 1 ? ' game' : ' games');
  const st = $('a-status');
  if (!shown.length) { st.textContent = q ? 'No games match “' + $('a-search').value.trim() + '”.' : 'No games found.'; st.className = 'adv-state'; st.hidden = false; }
  else st.hidden = true;
}

/* ---------- player ---------- */
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
async function download(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = +r.headers.get('content-length') || 0;
  if (!r.body || !r.body.getReader) return r.text();
  const reader = r.body.getReader(), chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length; onProgress(got, total);
  }
  return new Blob(chunks).text();
}

// Runs inside every game: reports script errors and files that fail to load back to the page.
const REPORTER = '<script>(function(){function s(m){try{parent.postMessage({cstuff:"err",m:String(m).slice(0,240)},"*")}catch(e){}}' +
  'addEventListener("error",function(e){var t=e.target;if(t&&t!==window&&(t.src||t.href)){s("Failed to load: "+(t.src||t.href))}else{s(e.message||e.error)}},true);' +
  'addEventListener("unhandledrejection",function(e){var r=e.reason;s("Promise: "+(r&&r.message||r))});' +
  'function m(){var b=null,q=document.querySelectorAll("canvas,embed,object,iframe,video");for(var i=0;i<q.length;i++){var r=q[i].getBoundingClientRect();if(r.width<2||r.height<2)continue;var c=getComputedStyle(q[i]);if(c.visibility==="hidden"||c.display==="none")continue;var a=r.width*r.height;if(!b||a>b.a)b={a:a,w:r.width,h:r.height,l:r.left,t:r.top}}' +
  'if(b)try{parent.postMessage({cstuff:"size",w:Math.round(b.w),h:Math.round(b.h),l:Math.round(b.l),t:Math.round(b.t),vw:innerWidth,vh:innerHeight},"*")}catch(e){}}' +
  '[1500,4000,9000].forEach(function(d){setTimeout(m,d)});})()<\/script>';

/* ---------- fit the game to the window ---------- */
let proxMode = false;
const af = () => (proxMode ? $('a-prox') : $('a-player'));
let fitOn = true, fitBox = null, lastFit = null;
function applyFit() {
  const f = af(), st = $('a-stage');
  if (!fitBox) { f.removeAttribute('style'); return; }
  const k = Math.min(st.clientWidth / fitBox.w, st.clientHeight / fitBox.h, 4);
  f.style.cssText = 'inset:auto;left:50%;top:50%;width:' + fitBox.w + 'px;height:' + fitBox.h + 'px;transform:translate(-50%,-50%) scale(' + k + ')';
}
function resetFit() { fitBox = null; lastFit = null; af().removeAttribute('style'); }
function onSize(d) {
  if (!fitOn || !current) return;
  if (![d.w, d.h, d.l, d.t, d.vw, d.vh].every(Number.isFinite) || d.w < 320 || d.h < 200) return;
  if (lastFit && Math.abs(d.w - lastFit.w) < 8 && Math.abs(d.h - lastFit.h) < 8) return;
  if (d.w >= 0.92 * d.vw && d.h >= 0.92 * d.vh) { resetFit(); return; } // already spans the window
  const cx = Math.abs(2 * d.l + d.w - d.vw) < 24, cy = Math.abs(2 * d.t + d.h - d.vh) < 24;
  fitBox = { w: cx ? d.w : d.l + d.w, h: cy ? d.h : d.t + d.h };
  lastFit = { w: d.w, h: d.h };
  applyFit();
}
function setFitUi() { const b = $('a-fit'); b.setAttribute('aria-pressed', String(fitOn)); b.textContent = 'Fit: ' + (fitOn ? 'on' : 'off'); }
$('a-fit').onclick = () => {
  fitOn = !fitOn; setFitUi(); if (window.cstuff) window.cstuff.set({ fitGames: fitOn });
  if (!fitOn) resetFit(); else if (current) play(current);
};
new ResizeObserver(() => { if (fitBox) applyFit(); }).observe($('a-stage'));

let diag = [];
function showDiag(lines) {
  const box = $('a-diag'); box.textContent = '';
  const t = document.createElement('b'); t.textContent = 'Problems: '; box.appendChild(t);
  box.appendChild(document.createTextNode(lines.slice(-8).join('  ·  ') + (proxMode ? '' : '   —   Tip: try the Proxy button above.')));
  box.hidden = false;
}
addEventListener('message', (e) => {
  const d = e.data;
  if (e.source !== $('a-player').contentWindow || !d) return;
  if (d.cstuff === 'size') return onSize(d);
  if (d.cstuff !== 'err' || typeof d.m !== 'string') return;
  if (diag.length >= 25 || diag.includes(d.m)) return;
  diag.push(d.m); showDiag(diag);
  // For files served by our own relay, ask it why it failed so the message says more than "failed to load".
  const mm = /^Failed to load: (\S+\/gm\/[^\s]+)$/.exec(d.m);
  if (mm && !whyDone.has(mm[1])) {
    whyDone.add(mm[1]);
    fetch(mm[1]).then(async (r) => {
      if (r.ok) { diag.push('(' + mm[1].split('/').pop() + ' loads fine now: HTTP ' + r.status + ', ' + (r.headers.get('content-type') || 'no type') + ')'); }
      else { const t = (await r.text()).slice(0, 80); diag.push(mm[1].split('/').pop() + ' → HTTP ' + r.status + ' ' + t); }
      showDiag(diag);
    }).catch((err) => { diag.push(mm[1].split('/').pop() + ' → ' + err.message); showDiag(diag); });
  }
});
const whyDone = new Set();

let playToken = 0, current = null;
const SAFE = 'allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals';
const compatList = () => { try { const a = window.cstuff && window.cstuff.get().compat; return Array.isArray(a) ? a : []; } catch { return []; } };
const proxList = () => { try { const a = window.cstuff && window.cstuff.get().proxied; return Array.isArray(a) ? a : []; } catch { return []; } };
const wantsProxy = (z) => { try { return !!window.cstuff.get().proxyGames || proxList().includes(z.path); } catch { return false; } };
function setProxUi(on) { const b = $('a-px'); b.setAttribute('aria-pressed', String(on)); b.textContent = 'Proxy: ' + (on ? 'on' : 'off'); $('a-compat').hidden = on; }
let measureTimer = 0;
async function playProxy(z, token) {
  const px = $('a-prox');
  $('a-diag').hidden = true;
  try {
    const { getEngine } = await import('/js/engine.js?v=20261018l');
    const sj = await getEngine();
    if (token !== playToken) return;
    if (!px._sj) px._sj = sj.createFrame(px);
    px.hidden = false;
    let info; try { info = await (await fetch(RELAY + '/_info')).json(); } catch { throw new Error('Could not reach the cstuff server'); }
    if (token !== playToken) return;
    px._sj.go('http://' + info.host + ':' + info.port + RELAY + '/html/' + z.path);
    $('a-load').textContent = '';
    const since = Date.now() - 1000; let logs = 0;
    const checkLog = async () => {
      if (token !== playToken) return;
      try {
        const l = await (await fetch(RELAY + '/_log?since=' + since)).json();
        if (l.length > logs) { logs = l.length; diag = l.map((f) => f.p.replace(/^html\//, '') + ' → ' + f.why).slice(-8); showDiag(['Missing files: ' + diag.join(', ')]); }
      } catch {}
    };
    [4000, 9000, 18000].forEach((ms) => setTimeout(checkLog, ms));
    clearInterval(measureTimer); let n = 0;
    measureTimer = setInterval(() => {
      if (token !== playToken || ++n > 8) return clearInterval(measureTimer);
      try {
        const d = px.contentDocument; if (!d) return;
        let b = null;
        for (const e of d.querySelectorAll('canvas,embed,object,video')) {
          const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
          if (!b || r.width * r.height > b.w * b.h) b = { w: r.width, h: r.height, l: r.left, t: r.top };
        }
        if (b) onSize({ w: Math.round(b.w), h: Math.round(b.h), l: Math.round(b.l), t: Math.round(b.t), vw: px.clientWidth, vh: px.clientHeight });
      } catch {}
    }, 2000);
  } catch (e) {
    $('a-load').textContent = 'Could not start the proxy.';
    showDiag(['Proxy: ' + e.message, 'Turn Proxy off to play it directly.']);
  }
}
function setCompatUi(on) {
  const b = $('a-compat'); b.setAttribute('aria-pressed', String(on)); b.textContent = 'Compatibility: ' + (on ? 'on' : 'off');
}
async function play(z) {
  clearInterval(measureTimer);
  proxMode = wantsProxy(z);
  current = z; resetFit();
  const token = ++playToken;
  setProxUi(proxMode);
  $('a-prox').hidden = true; if (!proxMode) { try { $('a-prox').src = 'about:blank'; } catch {} }
  $('a-player').hidden = proxMode;
  const compat = compatList().includes(z.path);
  setCompatUi(compat);
  $('a-title').textContent = z.name; $('a-load').textContent = 'Loading…';
  $('a-modal').classList.add('open');
  const f = $('a-player'); f.srcdoc = '';
  if (proxMode) { $('a-title').textContent = z.name; $('a-load').textContent = 'Starting proxy…'; return playProxy(z, token); }
  f.setAttribute('sandbox', compat ? SAFE + ' allow-same-origin' : SAFE);
  $('a-diag').hidden = true; $('a-diag').textContent = ''; diag = [];
  try {
    let html = null, from = '';
    const problems = [];
    for (const base of SOURCE.html) {
      const url = base + '/' + z.path;
      try {
        html = await download(url, (got, total) => {
          if (token === playToken) $('a-load').textContent = 'Downloading ' + mb(got) + (total ? ' of ' + mb(total) : '') + '…';
        });
        from = url; break;
      } catch (e) { problems.push(new URL(url, location.href).hostname + ': ' + e.message); if (token !== playToken) return; }
    }
    if (token !== playToken) return;
    if (html == null) throw new Error(problems.join(' | '));
    if (from.startsWith(RELAY + '/')) {
      // Point files that games reference on public CDNs at the relay too, so they get the right file types.
      html = html.replace(/https?:\/\/(?:cdn|fastly|gcore|testingcf)\.jsdelivr\.net\/gh\/gn-math\/(html|assets|covers)@(?:main|master)\//g, location.origin + RELAY + '/$1/')
                 .replace(/https?:\/\/raw\.githubusercontent\.com\/gn-math\/(html|assets|covers)\/(?:main|master)\//g, location.origin + RELAY + '/$1/');
    }
    // Drop analytics/ad scripts: they only add requests the school may block.
    html = html.replace(/<script\b[^>]*src=["'][^"']*(?:googletagmanager|google-analytics|doubleclick|googlesyndication|adsbygoogle)[^"']*["'][^>]*>\s*<\/script>/gi, '');
    const abs = new URL(from, location.href).href;
    let baseHref = abs.slice(0, abs.lastIndexOf('/') + 1);
    // Some games set their own <base> (often a jsDelivr folder of another GitHub repo). Keep it, but fetch through the relay.
    const own = /<base\s[^>]*href=["']([^"']+)["'][^>]*>/i.exec(html);
    if (own) {
      html = html.replace(own[0], '');
      try {
        const u = new URL(own[1], abs);
        const m = /^\/gh\/([\w.\-]+)\/([\w.\-]+)@([\w.\-]+)\/(.*)$/.exec(u.pathname);
        if (m && /(^|\.)jsdelivr\.net$/.test(u.hostname) && from.startsWith(RELAY + '/')) baseHref = location.origin + RELAY + '/x/' + m[1] + '/' + m[2] + '/' + m[3] + '/' + m[4];
        else baseHref = u.href;
      } catch {}
    }
    const base = '<base href="' + baseHref.replace(/"/g, '%22') + '">';
    const head = base + REPORTER;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, (m) => m + head) : head + html;
    f.srcdoc = html;
    $('a-load').textContent = '';
  } catch (e) {
    if (token === playToken) {
      $('a-load').textContent = 'Could not load this game.';
      showDiag(['Download failed: ' + e.message]);
    }
  }
}
$('a-px').onclick = () => {
  if (!current || !window.cstuff) return;
  if (window.cstuff.get().proxyGames) { alert('Proxy is on for every game (Settings → Games). Turn that off there to change it per game.'); return; }
  const list = proxList(), on = list.includes(current.path);
  window.cstuff.set({ proxied: on ? list.filter((p) => p !== current.path) : [...list, current.path] });
  play(current);
};
$('a-compat').onclick = () => {
  if (!current || !window.cstuff) return;
  const list = compatList(), on = list.includes(current.path);
  if (!on && !confirm('Compatibility mode lets this game use browser storage like a normal website, which many games need to start.\n\nThe catch: the game\u2019s code can then read data this site keeps in your browser, including logins from sites you used through the proxy. Only turn it on for games you trust.\n\nTurn it on for this game?')) return;
  window.cstuff.set({ compat: on ? list.filter((p) => p !== current.path) : [...list, current.path] });
  play(current);
};
function closePlayer() { playToken++; clearInterval(measureTimer); try { $('a-prox').src = 'about:blank'; } catch {} $('a-prox').hidden = true; $('a-modal').classList.remove('open'); $('a-player').srcdoc = ''; }
$('a-close').onclick = closePlayer;
$('a-modal').addEventListener('click', (e) => { if (e.target === $('a-modal')) closePlayer(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('a-modal').classList.contains('open')) closePlayer(); });
$('a-full').onclick = () => { const f = $('a-stage'); (f.requestFullscreen || f.webkitRequestFullscreen)?.call(f); };

/* ---------- loading the list ---------- */
function load() {
  if (loaded) return;
  if (loading) return loading;
  const st = $('a-status'); st.hidden = false; st.className = 'adv-state'; st.textContent = 'Loading games…';
  $('a-retry').hidden = true; $('a-site').hidden = true; $('a-tools').hidden = false;
  loading = fetchList().then((list) => { all = list; loaded = true; render(); })
    .catch((e) => {
      st.hidden = false; st.className = 'adv-state err';
      st.textContent = 'Couldn’t load the game list (' + e.message + '). Your network may be blocking GitHub, or gn-math may have moved its files.';
      $('a-tools').hidden = true; $('a-retry').hidden = false;
    }).finally(() => { loading = null; });
  return loading;
}
$('a-retry').onclick = () => load();

/* ---------- mode switch ---------- */
function setMode(mode, save = true) {
  const adv = mode === 'advanced';
  $('m-default').setAttribute('aria-pressed', String(!adv));
  $('m-adv').setAttribute('aria-pressed', String(adv));
  $('grid').hidden = adv; $('adv').hidden = !adv;
  $('mode-lead').textContent = LEAD[mode];
  if (save && window.cstuff) window.cstuff.set({ gamesMode: mode });
  history.replaceState(null, '', adv ? '#advanced' : location.pathname);
  if (adv) load();
}
$('m-default').addEventListener('click', () => setMode('default'));
$('m-adv').addEventListener('click', () => setMode('advanced'));
$('a-more').onclick = () => { limit += PAGE; render(); };
let st; $('a-search').addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { limit = PAGE; render(); }, 120); });

if (window.cstuff) fitOn = window.cstuff.get().fitGames !== false;
setFitUi();
const saved = window.cstuff ? window.cstuff.get().gamesMode : 'default';
setMode(location.hash === '#advanced' || (location.hash !== '#default' && saved === 'advanced') ? 'advanced' : 'default', false);
