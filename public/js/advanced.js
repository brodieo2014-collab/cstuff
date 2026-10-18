/* Advanced games: cstuff's own cards and player, with the games sourced from gn-math.dev. */
const $ = (id) => document.getElementById(id);

const SOURCE = {
  list: 'https://cdn.jsdelivr.net/gh/gn-math/assets@main/zones.json',
  covers: 'https://cdn.jsdelivr.net/gh/gn-math/covers@main',
  html: 'https://cdn.jsdelivr.net/gh/gn-math/html@main',
  site: 'https://gn-math.dev/',
};
const LEAD = {
  default: 'Quick games that run right in your browser. Your best scores are saved on this device.',
  advanced: 'Bigger games sourced from gn-math.dev. Search, pick one and play.',
};
const PAGE = 60;

let all = [], shown = [], limit = PAGE, loaded = false, loading = null;

const fill = (s) => String(s || '').replace('{COVER_URL}', SOURCE.covers).replace('{HTML_URL}', SOURCE.html);
const isHttps = (u) => /^https:\/\//i.test(u);

function normalize(raw) {
  const arr = Array.isArray(raw) ? raw : (raw && (raw.zones || raw.games)) || [];
  const seen = new Set();
  return arr.map((z) => ({
    id: z.id,
    name: String((z && z.name) || '').trim(),
    cover: fill(z && z.cover),
    url: fill(z && z.url),
  })).filter((z) => {
    if (!z.name || !isHttps(z.url) || seen.has(z.url)) return false;
    seen.add(z.url); return true;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

async function fetchList() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(SOURCE.list, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return normalize(await r.json());
  } finally { clearTimeout(t); }
}

function render() {
  const q = $('a-search').value.trim().toLowerCase();
  shown = q ? all.filter((z) => z.name.toLowerCase().includes(q)) : all;
  const grid = $('a-grid'); grid.textContent = '';
  shown.slice(0, limit).forEach((z) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'acard';
    const cv = document.createElement('span'); cv.className = 'cv';
    if (isHttps(z.cover)) {
      const img = document.createElement('img'); img.loading = 'lazy'; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = z.cover;
      img.onerror = () => { img.remove(); cv.textContent = '🎮'; };
      cv.appendChild(img);
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
let playToken = 0;
async function play(z) {
  const token = ++playToken;
  $('a-title').textContent = z.name; $('a-load').textContent = 'Loading…';
  $('a-modal').classList.add('open');
  const f = $('a-player'); f.srcdoc = '';
  try {
    const r = await fetch(z.url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let html = await r.text();
    if (token !== playToken) return;
    const base = '<base href="' + z.url.slice(0, z.url.lastIndexOf('/') + 1).replace(/"/g, '%22') + '">';
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, '<head$1>' + base) : base + html;
    f.srcdoc = html;
    $('a-load').textContent = '';
  } catch (e) {
    if (token === playToken) $('a-load').textContent = 'Could not load this game (' + e.message + ').';
  }
}
function closePlayer() { playToken++; $('a-modal').classList.remove('open'); $('a-player').srcdoc = ''; }
$('a-close').onclick = closePlayer;
$('a-modal').addEventListener('click', (e) => { if (e.target === $('a-modal')) closePlayer(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('a-modal').classList.contains('open')) closePlayer(); });
$('a-full').onclick = () => { const f = $('a-player'); (f.requestFullscreen || f.webkitRequestFullscreen)?.call(f); };

/* ---------- fallback: gn-math.dev itself, through the proxy ---------- */
let embed = null;
async function startEmbed() {
  $('a-embed').hidden = false;
  const st = (m, c = '') => { const s = $('e-status'); s.textContent = m; s.className = 'adv-src ' + c; };
  if (embed) return;
  st('Starting the proxy…');
  try {
    const { getEngine } = await import('/js/engine.js');
    const sj = await getEngine();
    embed = sj.createFrame($('e-frame'));
    embed.addEventListener('urlchange', (e) => { if (e && e.url) st(String(e.url)); });
    embed.go(SOURCE.site); st('Loading gn-math.dev…');
    $('e-back').onclick = () => { try { embed.back(); } catch {} };
    $('e-fwd').onclick = () => { try { embed.forward(); } catch {} };
    $('e-reload').onclick = () => { try { embed.reload(); } catch {} };
    $('e-home').onclick = () => embed.go(SOURCE.site);
    $('e-full').onclick = () => { const f = $('e-frame'); (f.requestFullscreen || f.webkitRequestFullscreen)?.call(f); };
  } catch (e) { embed = null; st('Could not start: ' + e.message, 'err'); }
}

/* ---------- loading the list ---------- */
function load() {
  if (loaded) return;
  if (loading) return loading;
  const st = $('a-status'); st.hidden = false; st.className = 'adv-state'; st.textContent = 'Loading games…';
  loading = fetchList().then((list) => {
    if (!list.length) throw new Error('empty list');
    all = list; loaded = true; render();
  }).catch((e) => {
    st.hidden = false; st.className = 'adv-state err';
    st.textContent = 'Couldn’t load the game list (' + e.message + '). Showing gn-math.dev directly instead.';
    $('a-search').closest('.adv-tools').hidden = true;
    startEmbed();
  }).finally(() => { loading = null; });
  return loading;
}

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
