import { BareMuxConnection } from '/baremux/index.mjs';

const $ = (id) => document.getElementById(id);
const status = $('status');
const iframe = $('frame');
const browser = $('browser');
const urlBar = $('b-url');
let ready = null;
let sj, sjFrame;

const SJ_STORES = ['config', 'cookies', 'redirectTrackers', 'referrerPolicies', 'publicSuffixList'];

// Scramjet's service worker opens its database the moment it starts, before the page has created the
// stores it needs. Creating them first (and repairing a half-made database) avoids that race.
function openSjDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('$scramjet', 1);
    req.onupgradeneeded = () => {
      for (const n of SJ_STORES) if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Storage is busy. Close other cstuff tabs and retry.'));
  });
}
async function ensureSjDb() {
  let db = await openSjDb();
  if (SJ_STORES.every((n) => db.objectStoreNames.contains(n))) { db.close(); return; }
  db.close();
  await new Promise((res, rej) => {
    const d = indexedDB.deleteDatabase('$scramjet');
    d.onsuccess = res; d.onerror = () => rej(d.error); d.onblocked = () => rej(new Error('Storage is busy. Close other cstuff tabs and retry.'));
  });
  db = await openSjDb();
  db.close();
}

function say(msg, cls = '') { status.textContent = msg; status.className = 'status ' + cls; }

async function init() {
  if (!('serviceWorker' in navigator)) throw new Error('This browser does not support service workers.');
  if (!window.isSecureContext) throw new Error('A secure (https) connection is required.');
  await ensureSjDb();
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const conn = new BareMuxConnection('/baremux/worker.js');
  const wisp = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/wisp/';
  await conn.setTransport('/epoxy/index.mjs', [{ wisp }]);

  const { ScramjetController } = $scramjetLoadController();
  sj = new ScramjetController({
    prefix: '/scramjet/',
    files: {
      wasm: '/scram/scramjet.wasm.wasm',
      all: '/scram/scramjet.all.js',
      sync: '/scram/scramjet.sync.js',
    },
  });
  await sj.init();
  sjFrame = sj.createFrame(iframe);
  sjFrame.addEventListener('urlchange', (e) => {
    const u = e && e.url;
    if (u) urlBar.value = String(u);
  });
}

function start() {
  if (!ready) ready = init();
  return ready;
}

function toUrl(input) {
  const v = input.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[^\s]+\.[a-z]{2,}([/:?#].*)?$/i.test(v) || /^localhost(:\d+)?/i.test(v)) return 'https://' + v;
  const engines = (window.cstuff && window.cstuff.ENGINES) || {};
  const base = engines[window.cstuff?.get().engine] || 'https://duckduckgo.com/?q=';
  return base + encodeURIComponent(v);
}

async function open(input) {
  const url = toUrl(input);
  if (!url) return;
  say('Connecting…');
  try {
    await start();
  } catch (e) {
    ready = null;
    say('Could not start the proxy: ' + e.message, 'err');
    return;
  }
  say('Ready', 'ok');
  browser.classList.add('open');
  urlBar.value = url;
  sjFrame.go(url);
}

$('go').addEventListener('submit', (e) => { e.preventDefault(); open($('q').value); });
document.querySelectorAll('.tile').forEach((t) => t.addEventListener('click', () => open(t.dataset.url)));
$('b-home').onclick = () => { browser.classList.remove('open'); iframe.src = 'about:blank'; };
$('b-back').onclick = () => { try { sjFrame.back(); } catch {} };
$('b-fwd').onclick = () => { try { sjFrame.forward(); } catch {} };
$('b-reload').onclick = () => { try { sjFrame.reload(); } catch {} };
$('b-full').onclick = () => { (iframe.requestFullscreen || iframe.webkitRequestFullscreen)?.call(iframe); };
urlBar.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(urlBar.value); });

// warm up in the background so the first click is fast
say('Starting up…');
start().then(() => say('Ready', 'ok')).catch((e) => { ready = null; say('Proxy failed to start: ' + e.message, 'err'); });
