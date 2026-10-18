/* Advanced games: cstuff's own cards and player, with the games sourced from gn-math.dev. */
const $ = (id) => document.getElementById(id);

// gn-math keeps its game list in the "assets" repo and the games/covers in the "html" and "covers" repos.
// jsDelivr refuses the oversized assets repo (HTTP 403), so the list is also tried straight from GitHub.
const GH = 'https://raw.githubusercontent.com/gn-math';
const JSD = 'https://cdn.jsdelivr.net/gh/gn-math';
const SOURCE = {
  list: [GH + '/assets/main/zones.json', JSD + '/assets@main/zones.json', 'https://fastly.jsdelivr.net/gh/gn-math/assets@main/zones.json'],
  covers: [JSD + '/covers@main', GH + '/covers/main'],
  html: [JSD + '/html@main', GH + '/html/main'],
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
  'addEventListener("unhandledrejection",function(e){var r=e.reason;s("Promise: "+(r&&r.message||r))});})()<\/script>';

let diag = [];
function showDiag(lines) {
  const box = $('a-diag'); box.textContent = '';
  const t = document.createElement('b'); t.textContent = 'Problems: '; box.appendChild(t);
  box.appendChild(document.createTextNode(lines.slice(-4).join('  ·  ')));
  box.hidden = false;
}
addEventListener('message', (e) => {
  const d = e.data;
  if (e.source !== $('a-player').contentWindow || !d || d.cstuff !== 'err' || typeof d.m !== 'string') return;
  if (diag.length >= 25 || diag.includes(d.m)) return;
  diag.push(d.m); showDiag(diag);
});

let playToken = 0, current = null;
const SAFE = 'allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals';
const compatList = () => { try { const a = window.cstuff && window.cstuff.get().compat; return Array.isArray(a) ? a : []; } catch { return []; } };
function setCompatUi(on) {
  const b = $('a-compat'); b.setAttribute('aria-pressed', String(on)); b.textContent = 'Compatibility: ' + (on ? 'on' : 'off');
}
async function play(z) {
  current = z;
  const token = ++playToken;
  const compat = compatList().includes(z.path);
  setCompatUi(compat);
  $('a-title').textContent = z.name; $('a-load').textContent = 'Loading…';
  $('a-modal').classList.add('open');
  const f = $('a-player'); f.srcdoc = '';
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
      } catch (e) { problems.push(new URL(url).hostname + ': ' + e.message); if (token !== playToken) return; }
    }
    if (token !== playToken) return;
    if (html == null) throw new Error(problems.join(' | '));
    const base = '<base href="' + from.slice(0, from.lastIndexOf('/') + 1).replace(/"/g, '%22') + '">';
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
$('a-compat').onclick = () => {
  if (!current || !window.cstuff) return;
  const list = compatList(), on = list.includes(current.path);
  if (!on && !confirm('Compatibility mode lets this game use browser storage like a normal website, which many games need to start.\n\nThe catch: the game\u2019s code can then read data this site keeps in your browser, including logins from sites you used through the proxy. Only turn it on for games you trust.\n\nTurn it on for this game?')) return;
  window.cstuff.set({ compat: on ? list.filter((p) => p !== current.path) : [...list, current.path] });
  play(current);
};
function closePlayer() { playToken++; $('a-modal').classList.remove('open'); $('a-player').srcdoc = ''; }
$('a-close').onclick = closePlayer;
$('a-modal').addEventListener('click', (e) => { if (e.target === $('a-modal')) closePlayer(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('a-modal').classList.contains('open')) closePlayer(); });
$('a-full').onclick = () => { const f = $('a-player'); (f.requestFullscreen || f.webkitRequestFullscreen)?.call(f); };

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
      $('a-tools').hidden = true; $('a-retry').hidden = false; $('a-site').hidden = false;
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

const saved = window.cstuff ? window.cstuff.get().gamesMode : 'default';
setMode(location.hash === '#advanced' || (location.hash !== '#default' && saved === 'advanced') ? 'advanced' : 'default', false);
