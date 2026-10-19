import { getEngine } from '/js/engine.js?v=20261018n';

const $ = (id) => document.getElementById(id);
const status = $('status');
const browser = $('browser');
const urlBar = $('b-url');
const views = $('views');
let ready = null;
let sj = null;
const tabs = [];
let cur = null;
let nid = 1;

function say(msg, cls = '') { status.textContent = msg; status.className = 'status ' + cls; }
function start() { if (!ready) ready = getEngine().then((e) => { sj = e; return e; }); return ready; }

function toUrl(input) {
  const v = input.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[^\s]+\.[a-z]{2,}([/:?#].*)?$/i.test(v) || /^localhost(:\d+)?/i.test(v)) return 'https://' + v;
  const engines = (window.cstuff && window.cstuff.ENGINES) || {};
  const base = engines[window.cstuff?.get().engine] || 'https://duckduckgo.com/?q=';
  return base + encodeURIComponent(v);
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/* ---------- storage: bookmarks + history ---------- */
const MK = 'cstuff:sites', HK = 'cstuff:history';
const readJ = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const loadSites = () => readJ(MK).filter((x) => typeof x === 'string');
const saveSites = (a) => writeJ(MK, a);
function addHistory(url, title) {
  if (!/^https?:/i.test(url)) return;
  const h = readJ(HK);
  if (h[0] && h[0].url === url) { if (title) h[0].title = title; }
  else h.unshift({ url, title: title || '', t: Date.now() });
  writeJ(HK, h.slice(0, 300));
}

/* ---------- tabs ---------- */
function renderTabs() {
  const box = $('tabs'); box.textContent = '';
  for (const t of tabs) {
    const d = document.createElement('div'); d.className = 'tab' + (t === cur ? ' on' : '');
    const tt = document.createElement('span'); tt.className = 'tt'; tt.textContent = t.title || (t.url ? hostOf(t.url) : 'New tab');
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.title = 'Close tab';
    x.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t); });
    d.append(tt, x); d.addEventListener('click', () => activate(t)); box.appendChild(d);
  }
  const p = document.createElement('div'); p.className = 'plus'; p.textContent = '＋'; p.title = 'New tab';
  p.addEventListener('click', () => newTab()); box.appendChild(p);
}
function syncBar() {
  urlBar.value = cur && cur.url ? cur.url : '';
  $('b-star').textContent = cur && cur.url && loadSites().includes(cur.url) ? '★' : '☆';
}
function activate(t) {
  cur = t;
  tabs.forEach((x) => x.el.classList.toggle('on', x === t));
  renderTabs(); syncBar();
}
async function newTab(input) {
  browser.classList.add('open');
  try { await start(); } catch (e) { ready = null; browser.classList.remove('open'); say('Could not start the proxy: ' + e.message, 'err'); return null; }
  const el = document.createElement('iframe');
  el.title = 'cstuff tab'; el.allow = 'fullscreen; autoplay; clipboard-read; clipboard-write';
  views.appendChild(el);
  const t = { id: nid++, el, sj: sj.createFrame(el), url: '', title: '' };
  t.sj.addEventListener('urlchange', (e) => {
    const u = e && e.url; if (!u) return;
    t.url = String(u); addHistory(t.url, t.title);
    if (t === cur) syncBar();
    renderTabs();
  });
  tabs.push(t); activate(t);
  const url = input ? toUrl(input) : null;
  if (url) { t.url = url; t.sj.go(url); activate(t); } else { el.src = '/newtab.html'; }
  return t;
}
function closeTab(t) {
  const i = tabs.indexOf(t); if (i < 0) return;
  tabs.splice(i, 1); t.el.remove();
  if (!tabs.length) { cur = null; browser.classList.remove('open'); renderTabs(); return; }
  if (cur === t) activate(tabs[Math.min(i, tabs.length - 1)]); else renderTabs();
}
async function open(input) {
  const url = toUrl(input); if (!url) return;
  if (cur && browser.classList.contains('open') && cur.el.src.endsWith('/newtab.html')) { cur.url = url; cur.sj.go(url); activate(cur); return; }
  say('Connecting…');
  const t = await newTab(url);
  if (t) say('Ready', 'ok');
}
async function navigate(input) {
  const url = toUrl(input); if (!url) return;
  if (!cur) return open(input);
  cur.url = url; cur.title = ''; cur.sj.go(url); activate(cur);
}
addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data && typeof e.data.cstuffGo === 'string') navigate(e.data.cstuffGo);
});
// Keep tab names fresh from the page titles.
setInterval(() => {
  let changed = false;
  for (const t of tabs) {
    try {
      const d = t.el.contentDocument; const tt = d && d.title;
      if (tt && tt !== 'New tab' && tt !== t.title && !t.el.src.endsWith('/newtab.html')) { t.title = tt; changed = true; if (t.url) addHistory(t.url, tt); }
      else if (t.el.src.endsWith('/newtab.html') && t.title) { t.title = ''; changed = true; }
    } catch {}
  }
  if (changed) renderTabs();
}, 1200);

/* ---------- bookmarks bar ---------- */
function renderBar() {
  const bar = $('bmbar'); bar.textContent = '';
  for (const u of loadSites()) {
    const a = document.createElement('a'); a.textContent = hostOf(u); a.title = u;
    a.addEventListener('click', () => navigate(u)); bar.appendChild(a);
  }
}
$('b-star').onclick = () => {
  if (!cur || !cur.url) return;
  const a = loadSites(); const i = a.indexOf(cur.url);
  if (i >= 0) a.splice(i, 1); else if (a.length < 40) a.push(cur.url);
  saveSites(a); syncBar(); renderBar(); renderMine();
};

/* ---------- history panel ---------- */
function renderHist() {
  const q = $('h-q').value.toLowerCase(); const box = $('h-list'); box.textContent = '';
  const items = readJ(HK).filter((h) => !q || (h.url + ' ' + h.title).toLowerCase().includes(q)).slice(0, 120);
  if (!items.length) { box.innerHTML = '<a style="opacity:.6;cursor:default">Nothing here yet.</a>'; return; }
  for (const h of items) {
    const a = document.createElement('a');
    const b = document.createElement('div'); b.textContent = h.title || hostOf(h.url);
    const sm = document.createElement('small'); sm.textContent = h.url;
    a.append(b, sm); a.addEventListener('click', () => { $('hist').hidden = true; navigate(h.url); }); box.appendChild(a);
  }
}
$('b-hist').onclick = () => { const h = $('hist'); h.hidden = !h.hidden; if (!h.hidden) renderHist(); };
$('h-close').onclick = () => { $('hist').hidden = true; };
$('h-clear').onclick = () => { if (confirm('Clear your browsing history?')) { writeJ(HK, []); renderHist(); } };
$('h-q').addEventListener('input', renderHist);

/* ---------- home page ---------- */
$('go').addEventListener('submit', (e) => { e.preventDefault(); open($('q').value); });
document.querySelectorAll('#go ~ .tiles .tile, .hero > .tiles:not(#mine) .tile').forEach((t) => t.addEventListener('click', () => open(t.dataset.url)));
// Your own shortcuts, saved on this device.
function renderMine() {
  const box = $('mine'); box.textContent = '';
  const list = loadSites();
  list.forEach((u, i) => {
    const t = document.createElement('a'); t.className = 'tile';
    let host = u; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch {}
    const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = '⭐';
    const x = document.createElement('span'); x.textContent = ' ✕'; x.title = 'Remove'; x.style.opacity = '.5';
    x.addEventListener('click', (e) => { e.stopPropagation(); const a = loadSites(); a.splice(i, 1); saveSites(a); renderMine(); renderBar(); });
    t.append(ic, host, x); t.addEventListener('click', () => open(u)); box.appendChild(t);
  });
  const add = document.createElement('a'); add.className = 'tile';
  add.innerHTML = '<span class="ic">＋</span>Add site';
  add.addEventListener('click', () => {
    let v = (prompt('Web address to save as a shortcut:') || '').trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { new URL(v); } catch { return; }
    const a = loadSites(); if (!a.includes(v) && a.length < 24) a.push(v); saveSites(a); renderMine(); renderBar();
  });
  box.appendChild(add);
}
renderMine();
renderBar();
$('b-home').onclick = () => { browser.classList.remove('open'); };
$('b-back').onclick = () => { try { cur && cur.sj.back(); } catch {} };
$('b-fwd').onclick = () => { try { cur && cur.sj.forward(); } catch {} };
$('b-reload').onclick = () => { try { cur && cur.sj.reload(); } catch {} };
$('b-blank').onclick = () => { if (!window.cstuff.openBlank()) alert('Your browser blocked the pop-up. Allow pop-ups for this site and try again.'); };
$('b-full').onclick = () => { const f = cur && cur.el; (f && (f.requestFullscreen || f.webkitRequestFullscreen))?.call(f); };
urlBar.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(urlBar.value); });
urlBar.addEventListener('focus', () => urlBar.select());

// warm up in the background so the first click is fast
say('Starting up…');
start().then(() => say('Ready', 'ok')).catch((e) => { ready = null; say('Proxy failed to start: ' + e.message, 'err'); });
